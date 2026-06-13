import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.extraction.llm import LLMClient
from app.models import User, UserRole
from app.models.profiler import (
    ConflictStatus,
    ProfilerArea,
    ProfilerConflict,
    ProfilerContributor,
    ProfilerProfile,
    ProfilerRanking,
    ProfilerReference,
    ProfilerReferenceAttributes,
    ProfilerTheme,
    ProfileStatus,
    ThemeStatus,
)
from app.profiler.extraction import extract_reference_attributes, get_llm
from app.profiler.schemas import (
    AreaOut,
    ConflictOut,
    ConflictResolveIn,
    ContributorIn,
    ContributorOut,
    ProfileCreate,
    ProfileDetailOut,
    ProfileOut,
    RankingIn,
    ReferenceIn,
    ReferenceOut,
    ThemeDecisionIn,
    ThemeOut,
)
from app.profiler.taste import build_taste_model, check_consistency
from app.profiler.themes import narrate_themes, top_reference_ids

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/design", tags=["design-profiler"])

# Who may create/edit a profile on the contractor side (homeowner-side gating is added in Plan 3).
_EDIT_ROLES = (UserRole.owner, UserRole.pm, UserRole.architect, UserRole.supervisor)


async def _load_owned_profile(
    session: AsyncSession, profile_id: UUID, user: User
) -> ProfilerProfile:
    profile = await session.get(ProfilerProfile, profile_id)
    if profile is None or profile.company_id != user.company_id:
        raise AppError(404, "not_found", "Profile not found")
    return profile


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


async def _sync_conflicts(
    session: AsyncSession, profile_id: UUID, area_id: UUID, conflicts: list[dict]
) -> None:
    """Replace this area's OPEN conflicts with the freshly-detected set.

    Resolved conflicts are preserved; only OPEN ones are replaced.
    """
    existing = (
        await session.execute(
            select(ProfilerConflict).where(
                ProfilerConflict.area_id == area_id,
                ProfilerConflict.resolution_status == ConflictStatus.open,
            )
        )
    ).scalars().all()
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


@router.post("/profiles", response_model=ProfileOut, status_code=201)
async def create_profile(
    body: ProfileCreate,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> ProfileOut:
    profile = ProfilerProfile(
        company_id=user.company_id,
        site_id=body.site_id,
        scope_type=body.scope_type,
        created_by=user.id,
        status=ProfileStatus.intake_started,
    )
    session.add(profile)
    await session.flush()
    for a in body.areas:
        session.add(
            ProfilerArea(
                profile_id=profile.id,
                area_kind=a.area_kind,
                area_key=a.area_key,
                space_id=a.space_id,
                component_id=a.component_id,
                recommended_count=a.recommended_count,
            )
        )
    for c in body.contributors:
        session.add(
            ProfilerContributor(
                profile_id=profile.id,
                member_id=c.member_id,
                user_id=c.user_id,
                role=c.role,
                is_decision_owner=c.is_decision_owner,
            )
        )
    await session.commit()
    await session.refresh(profile)
    return ProfileOut.model_validate(profile)


@router.get("/profiles", response_model=list[ProfileOut])
async def list_profiles(
    site_id: UUID | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ProfileOut]:
    """List design profiles for the company (optionally filtered to one site).

    Powers the owner Design hub — there is no per-site lookup otherwise. Read is
    open to any authenticated member; everything stays company-scoped.
    """
    stmt = select(ProfilerProfile).where(ProfilerProfile.company_id == user.company_id)
    if site_id is not None:
        stmt = stmt.where(ProfilerProfile.site_id == site_id)
    stmt = stmt.order_by(ProfilerProfile.created_at.desc())
    rows = (await session.execute(stmt)).scalars().all()
    return [ProfileOut.model_validate(p) for p in rows]


@router.get("/profiles/{profile_id}", response_model=ProfileDetailOut)
async def get_profile(
    profile_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProfileDetailOut:
    profile = await _load_owned_profile(session, profile_id, user)
    areas = (
        (await session.execute(select(ProfilerArea).where(ProfilerArea.profile_id == profile_id)))
        .scalars()
        .all()
    )
    contributors = (
        (
            await session.execute(
                select(ProfilerContributor).where(ProfilerContributor.profile_id == profile_id)
            )
        )
        .scalars()
        .all()
    )
    out = ProfileDetailOut.model_validate(profile)
    out.areas = [AreaOut.model_validate(a) for a in areas]
    out.contributors = [ContributorOut.model_validate(c) for c in contributors]
    return out


@router.post("/profiles/{profile_id}/contributors", status_code=201)
async def add_contributor(
    profile_id: UUID,
    body: ContributorIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    profile = await _load_owned_profile(session, profile_id, user)
    c = ProfilerContributor(
        profile_id=profile.id,
        member_id=body.member_id,
        user_id=body.user_id,
        role=body.role,
        is_decision_owner=body.is_decision_owner,
    )
    session.add(c)
    await session.commit()
    return {"id": str(c.id)}


@router.post("/references", response_model=ReferenceOut, status_code=201)
async def add_reference(
    body: ReferenceIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> ReferenceOut:
    area = await session.get(ProfilerArea, body.area_id)
    if area is None:
        raise AppError(404, "not_found", "Area not found")
    await _load_owned_profile(session, area.profile_id, user)
    ref = ProfilerReference(
        profile_id=area.profile_id,
        area_id=area.id,
        contributor_id=body.contributor_id,
        source_type=body.source_type,
        image_r2_key=body.image_r2_key,
        source_url=body.source_url,
        preset_id=body.preset_id,
    )
    session.add(ref)
    await session.flush()

    image_url = body.source_url or body.image_r2_key
    if image_url:
        try:
            attrs = await extract_reference_attributes(llm, image_url)
        except Exception:  # never fail the request on extraction
            logger.exception("profiler: vision extraction failed for reference %s", ref.id)
            attrs = None
        if attrs:
            confidence = float(attrs.get("confidence") or 0.0)
            session.add(
                ProfilerReferenceAttributes(
                    reference_id=ref.id, attributes=attrs, confidence=confidence
                )
            )
            verdict = check_consistency(attrs, area.taste_model or {})
            ref.consistency_status = verdict["status"]
            ref.consistency_note = verdict["reason"]

    await session.commit()
    await session.refresh(ref)
    return ReferenceOut.model_validate(ref)


@router.post("/references/{reference_id}/rankings", status_code=201)
async def rank_reference(
    reference_id: UUID,
    body: RankingIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    ref = await session.get(ProfilerReference, reference_id)
    if ref is None:
        raise AppError(404, "not_found", "Reference not found")
    await _load_owned_profile(session, ref.profile_id, user)
    existing = (
        await session.execute(
            select(ProfilerRanking).where(
                ProfilerRanking.reference_id == reference_id,
                ProfilerRanking.contributor_id == body.contributor_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.stars = body.stars
        existing.tags = body.tags
        existing.note = body.note
    else:
        session.add(
            ProfilerRanking(
                reference_id=reference_id,
                contributor_id=body.contributor_id,
                stars=body.stars,
                tags=body.tags,
                note=body.note,
            )
        )
    await session.commit()
    return {"ok": True}


@router.get("/profiles/{profile_id}/areas/{area_id}/taste")
async def get_area_taste(
    profile_id: UUID,
    area_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await _load_owned_profile(session, profile_id, user)
    area = await session.get(ProfilerArea, area_id)
    if area is None or area.profile_id != profile_id:
        raise AppError(404, "not_found", "Area not found")

    rankings, attrs = await _area_signals(session, area_id)
    model = build_taste_model(rankings, attrs, area.recommended_count)
    # Persist the deterministic summary back onto the area (no LLM involved here).
    area.taste_model = model["dimensions"]
    area.confidence = model["confidence"]
    area.has_conflict = model["has_conflict"]
    await session.commit()
    return model


@router.post(
    "/profiles/{profile_id}/areas/{area_id}/themes",
    response_model=list[ThemeOut],
    status_code=201,
)
async def generate_themes(
    profile_id: UUID,
    area_id: UUID,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> list[ThemeOut]:
    await _load_owned_profile(session, profile_id, user)
    area = await session.get(ProfilerArea, area_id)
    if area is None or area.profile_id != profile_id:
        raise AppError(404, "not_found", "Area not found")

    rankings, attrs = await _area_signals(session, area_id)
    model = build_taste_model(rankings, attrs, area.recommended_count)
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
    await session.commit()
    for t in created:
        await session.refresh(t)
    return [ThemeOut.model_validate(t) for t in created]


@router.get("/profiles/{profile_id}/areas/{area_id}/themes", response_model=list[ThemeOut])
async def list_themes(
    profile_id: UUID,
    area_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ThemeOut]:
    await _load_owned_profile(session, profile_id, user)
    area = await session.get(ProfilerArea, area_id)
    if area is None or area.profile_id != profile_id:
        raise AppError(404, "not_found", "Area not found")
    rows = (
        await session.execute(
            select(ProfilerTheme)
            .where(ProfilerTheme.area_id == area_id)
            .order_by(ProfilerTheme.created_at)
        )
    ).scalars().all()
    return [ThemeOut.model_validate(t) for t in rows]


@router.get("/profiles/{profile_id}/conflicts", response_model=list[ConflictOut])
async def list_conflicts(
    profile_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ConflictOut]:
    await _load_owned_profile(session, profile_id, user)
    rows = (
        await session.execute(
            select(ProfilerConflict)
            .where(ProfilerConflict.profile_id == profile_id)
            .order_by(ProfilerConflict.created_at)
        )
    ).scalars().all()
    return [ConflictOut.model_validate(c) for c in rows]


@router.post("/themes/{theme_id}/decision", response_model=ThemeOut)
async def decide_theme(
    theme_id: UUID,
    body: ThemeDecisionIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> ThemeOut:
    theme = await session.get(ProfilerTheme, theme_id)
    if theme is None:
        raise AppError(404, "not_found", "Theme not found")
    await _load_owned_profile(session, theme.profile_id, user)
    theme.status = {
        "approve": ThemeStatus.approved,
        "adjust": ThemeStatus.adjusted,
        "reject": ThemeStatus.rejected,
    }[body.action]
    theme.decided_by = user.id
    theme.decided_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(theme)
    return ThemeOut.model_validate(theme)


@router.post("/conflicts/{conflict_id}/resolve", response_model=ConflictOut)
async def resolve_conflict(
    conflict_id: UUID,
    body: ConflictResolveIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> ConflictOut:
    conflict = await session.get(ProfilerConflict, conflict_id)
    if conflict is None:
        raise AppError(404, "not_found", "Conflict not found")
    await _load_owned_profile(session, conflict.profile_id, user)
    conflict.resolution_status = (
        ConflictStatus.deferred_to_architect
        if body.resolution == "defer_to_architect"
        else ConflictStatus.resolved
    )
    conflict.resolved_by = user.id
    conflict.decision_note = body.note or body.resolution
    conflict.resolved_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(conflict)
    return ConflictOut.model_validate(conflict)
