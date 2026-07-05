"""Shared design-profiler generation engine.

Centralizes the taste-model computation and the theme/clarification proposal
logic that the route handlers in ``app/profiler/router.py`` call. Extracted
as a pure refactor (Task 2 of the design-loop program) so Task 3's
``refresh_taste_and_maybe_propose`` can build on top of these functions.

None of these functions commit — callers own the transaction boundary.
"""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.extraction.llm import LLMClient
from app.models.profiler import (
    AreaStatus,
    ConflictStatus,
    ProfilerArea,
    ProfilerClarification,
    ProfilerConflict,
    ProfilerRanking,
    ProfilerReference,
    ProfilerReferenceAttributes,
    ProfilerTheme,
    ThemeStatus,
)
from app.profiler.brief import generate_clarifications
from app.profiler.taste import build_taste_model
from app.profiler.themes import narrate_themes, top_reference_ids

logger = logging.getLogger(__name__)


async def _area_signals(
    session: AsyncSession, area_id: UUID
) -> tuple[list[dict], list[dict]]:
    """The (rankings, attributes) dict-lists the reducer expects, for one area."""
    ref_ids = (
        (
            await session.execute(
                select(ProfilerReference.id).where(ProfilerReference.area_id == area_id)
            )
        )
        .scalars()
        .all()
    )
    if not ref_ids:
        return [], []
    rank_rows = (
        await session.execute(
            select(ProfilerRanking).where(ProfilerRanking.reference_id.in_(ref_ids))
        )
    ).scalars().all()
    attr_rows = (
        await session.execute(
            select(ProfilerReferenceAttributes).where(
                ProfilerReferenceAttributes.reference_id.in_(ref_ids)
            )
        )
    ).scalars().all()
    rankings = [
        {
            "reference_id": str(r.reference_id),
            "contributor_id": str(r.contributor_id),
            "stars": r.stars,
            "tags": r.tags,
        }
        for r in rank_rows
    ]
    attrs = [
        {"reference_id": str(a.reference_id), "attributes": a.attributes} for a in attr_rows
    ]
    return rankings, attrs


def _conflict_identity(
    dimension: str, value: str, contributor_a_id: UUID, contributor_b_id: UUID
) -> tuple[str, str, UUID, UUID]:
    return (dimension, value, contributor_a_id, contributor_b_id)


async def _sync_conflicts(
    session: AsyncSession, profile_id: UUID, area_id: UUID, conflicts: list[dict]
) -> bool:
    """Replace this area's OPEN conflicts with the freshly-detected set.

    Resolved conflicts are preserved; only OPEN ones are replaced.

    Returns whether the fresh set contains at least one conflict identity
    (dimension, value, contributor_a_id, contributor_b_id) that was NOT in the
    pre-delete OPEN set — i.e. a genuinely NEW conflict, not a re-detection of
    one that was already open. This lets callers fire conflict_detected once
    per new conflict instead of once per write.
    """
    existing = (
        await session.execute(
            select(ProfilerConflict).where(
                ProfilerConflict.area_id == area_id,
                ProfilerConflict.resolution_status == ConflictStatus.open,
            )
        )
    ).scalars().all()
    existing_identities = {
        _conflict_identity(c.dimension, c.value, c.contributor_a_id, c.contributor_b_id)
        for c in existing
    }
    fresh_identities = {
        _conflict_identity(
            cf["dimension"], cf["value"], UUID(cf["contributor_a"]), UUID(cf["contributor_b"])
        )
        for cf in conflicts
    }
    has_new = bool(fresh_identities - existing_identities)

    for c in existing:
        await session.delete(c)
    for cf in conflicts:
        session.add(
            ProfilerConflict(
                profile_id=profile_id,
                area_id=area_id,
                dimension=cf["dimension"],
                value=cf["value"],
                contributor_a_id=UUID(cf["contributor_a"]),
                contributor_b_id=UUID(cf["contributor_b"]),
            )
        )
    return has_new


async def compute_and_persist_taste(session: AsyncSession, area: ProfilerArea) -> dict:
    """build_taste_model over _area_signals; writes area.taste_model/confidence/
    has_conflict/status (no commit). Returns the full model dict.

    Status is derived deterministically from the model and is monotonic —
    ready never regresses to in_progress (or not_started) on a later call.
    All six call sites of this function (via refresh_taste_and_maybe_propose)
    are reference/ranking writes, so the hook merely running at all implies
    the area has activity; there is no dict field for "reference exists"
    (taste.py's build_taste_model only reports ranked_count), so a
    ranked_count of 0 here still means "some write just happened" and is
    enough to leave not_started for in_progress.
    """
    rankings, attrs = await _area_signals(session, area.id)
    model = build_taste_model(rankings, attrs, area.recommended_count)
    area.taste_model = model["dimensions"]
    area.confidence = model["confidence"]
    if model["ranked_count"] >= area.recommended_count:
        area.status = AreaStatus.ready
    elif area.status != AreaStatus.ready:
        area.status = AreaStatus.in_progress
    area.has_conflict = model["has_conflict"]
    return model


async def propose_themes_for_area(
    session: AsyncSession,
    llm: LLMClient,
    profile_id: UUID,
    area: ProfilerArea,
    model: dict,
) -> list[ProfilerTheme]:
    """The exact body of today's generate_themes after the model is built:
    narrate (exception-safe) -> delete prior SUGGESTED -> insert new (confidence
    from model) -> _sync_conflicts. No commit."""
    area_id = area.id
    rankings, _attrs = await _area_signals(session, area_id)
    evidence = top_reference_ids(rankings)

    try:
        proposals = await narrate_themes(llm, area.area_key, model)
    except Exception:  # narration must never 500 the request
        logger.exception("profiler: theme narration failed for area %s", area_id)
        proposals = []

    # Replace prior SUGGESTED themes for this area (keep approved/adjusted/rejected).
    prior = (
        await session.execute(
            select(ProfilerTheme).where(
                ProfilerTheme.area_id == area_id, ProfilerTheme.status == ThemeStatus.suggested
            )
        )
    ).scalars().all()
    for t in prior:
        await session.delete(t)

    created: list[ProfilerTheme] = []
    for p in proposals:
        theme = ProfilerTheme(
            profile_id=profile_id, area_id=area_id,
            name=(p.get("name") or "Untitled"),
            palette=(p.get("palette") or []),
            materials=(p.get("materials") or []),
            rationale=p.get("rationale"),
            evidence_reference_ids=evidence,
            confidence=model["confidence"],  # reducer math, never the LLM
        )
        session.add(theme)
        created.append(theme)

    await _sync_conflicts(session, profile_id, area_id, model["conflicts"])
    return created


async def propose_clarifications_for_area(
    session: AsyncSession,
    llm: LLMClient,
    profile_id: UUID,
    area: ProfilerArea,
    model: dict,
) -> list[ProfilerClarification]:
    """Today's generate_clarifications_endpoint body after model build. No commit."""
    area_id = area.id
    try:
        questions = await generate_clarifications(llm, area.area_key, model)
    except Exception:  # never 500 on narration
        logger.exception(
            "profiler: clarification generation failed for area %s", area_id
        )
        questions = []

    created: list[ProfilerClarification] = []
    for q in questions:
        row = ProfilerClarification(
            profile_id=profile_id,
            area_id=area_id,
            question=q,
            source_attribution={
                "confidence": model["confidence"],
                "has_conflict": model["has_conflict"],
            },
        )
        session.add(row)
        created.append(row)
    return created


async def refresh_taste_and_maybe_propose(
    session: AsyncSession, llm: LLMClient, profile_id: UUID, area_id: UUID,
) -> dict | None:
    """Called after every ranking/reference write, pre-commit.
    1. compute_and_persist_taste (taste now persists on WRITE — Task 4 removes
       the GET side-effect).
    2. If model['ranked_count'] >= area.recommended_count AND
       model['ranked_count'] != area.last_proposal_ranked_count:
         propose_themes_for_area + (if model['confidence'] < 0.7 or
         model['has_conflict']) propose_clarifications_for_area;
         area.last_proposal_ranked_count = model['ranked_count'].
    Proposal errors are logged, never raised (ranking must always save).

    Runs pre-commit inside the calling handler's transaction, so it cannot emit
    notifications itself (a notify before commit could announce a write that
    later rolls back). Instead it RETURNS a summary the caller emits from AFTER
    its own session.commit(): {"proposed_themes": bool, "asked_clarifications":
    bool, "new_conflict": bool, "area_label": area.area_key}, or None when
    nothing happened this call (area missing, or threshold not crossed)."""
    area = await session.get(ProfilerArea, area_id)
    if area is None:
        return None
    model = await compute_and_persist_taste(session, area)
    # Conflicts are deterministic (no LLM) and must reflect EVERY write, not only
    # the threshold-crossing case below: a second contributor can disagree on refs
    # that were already ranked (ranked_count unchanged), which would otherwise
    # never re-run propose_themes_for_area (the only other _sync_conflicts caller)
    # and leave GET /conflicts stale/empty despite area.has_conflict=True.
    #
    # new_conflict: _sync_conflicts returns whether the fresh set contains a
    # conflict identity absent from the pre-delete OPEN set, i.e. a genuinely
    # NEW conflict rather than a re-detection of one that's already standing.
    # THIS call must run first and own the flag: when the threshold branch below
    # also calls propose_themes_for_area (which internally re-runs
    # _sync_conflicts on the exact same `model["conflicts"]`), that second sync
    # sees the set it just wrote as the pre-delete set and returns False —
    # content-wise a no-op — so it must never overwrite `new_conflict` computed
    # here. Do not swap this call after the threshold branch.
    new_conflict = await _sync_conflicts(session, profile_id, area_id, model["conflicts"])
    if (
        model["ranked_count"] >= area.recommended_count
        and model["ranked_count"] != area.last_proposal_ranked_count
    ):
        try:
            await propose_themes_for_area(session, llm, profile_id, area, model)
            asked_clarifications = False
            if model["confidence"] < 0.7 or model["has_conflict"]:
                await propose_clarifications_for_area(session, llm, profile_id, area, model)
                asked_clarifications = True
            area.last_proposal_ranked_count = model["ranked_count"]
            return {
                "proposed_themes": True,
                "asked_clarifications": asked_clarifications,
                "new_conflict": new_conflict,
                "area_label": area.area_key,
            }
        except Exception:
            logger.exception(
                "profiler: auto-propose failed for area %s (profile %s)", area_id, profile_id
            )
            return None
    if new_conflict:
        return {
            "proposed_themes": False,
            "asked_clarifications": False,
            "new_conflict": True,
            "area_label": area.area_key,
        }
    return None
