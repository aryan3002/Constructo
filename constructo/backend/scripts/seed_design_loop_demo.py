"""Seed the full-loop Design Profiler demo world — company "Neev Demo Homes".

Structure-copied from ``seed_profiler_demo.py`` (upsert-by-uuid5 pattern) and
``seed_designer_calm.py`` (architect persona + multi-role company). Unlike
those two, this seed builds its OWN company/site from scratch (rather than
attaching to a pre-existing SUNRISE-HOME row) so it never collides with other
demo data in a shared dev DB, and drives the REAL profiler engine
(``app.profiler.engine.refresh_taste_and_maybe_propose``) with a
``FakeLLMClient`` so themes/clarifications/status are engine-real rather than
hand-faked JSON.

Builds one company + site with:

  - A homeowner owner + co-owner (both real ``User(role=homeowner)`` rows with
    ``active`` ``HomeownerMember`` rows) — login via OTP 000000.
  - An architect user (the ``seed_designer_calm.py`` persona pattern).
  - A ProfilerProfile with 3 areas:
      * kitchen    — ranked PAST threshold by BOTH contributors (auto-propose
                     has fired: suggested themes + clarifications).
      * living_room — 1 OPEN conflict between the two owners + 1 conflict
                      resolved as deferred_to_architect.
      * master_bedroom — 0 references (quick-start-entry demo).
  - Clarifications: >= 2 for kitchen, 1 answered.
  - Brief v2 in architect_review (v1 went through request_changes, so the
    approvals history shows both rows).
  - 2 materialized Specs from an older approved historical brief, routed via
    the REAL ``app.specs.service.sync_spec_routed_decision`` bridge so 2
    pending homeowner Decisions exist WITH spec_id/site_id/spec_label
    resolvable exactly the way ``GET /homeowner/decisions`` resolves them.
  - The curated preset catalog, seeded from ``assets/presets/manifest.json``
    when present (real photos), else the gradient placeholder fallback.

Run from the backend dir:

    uv run python -m scripts.seed_design_loop_demo

IDEMPOTENT: every row uses a deterministic uuid5 id and upsert-in-place, so
re-running prints zero net-new creates (only "updated" / "reused" counts).
"""

from __future__ import annotations

import asyncio
from decimal import Decimal
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.extraction.llm import FakeLLMClient
from app.models import (
    Company,
    Component,
    ComponentStatus,
    Decision,
    HomeownerMember,
    HomeownerSubRole,
    Material,
    MemberStatus,
    Site,
    Space,
    SpaceKind,
    Spec,
    SpecApprovalStatus,
    User,
    UserRole,
)
from app.models.profiler import (
    AreaKind,
    BriefAction,
    BriefAudience,
    BriefState,
    ConflictStatus,
    ContributorRole,
    ProfilerArea,
    ProfilerBrief,
    ProfilerBriefApproval,
    ProfilerBriefRendering,
    ProfilerClarification,
    ProfilerConflict,
    ProfilerContributor,
    ProfilerProfile,
    ProfilerRanking,
    ProfilerReference,
    ProfilerReferenceAttributes,
    ProfilerTheme,
    ProfileScope,
    ProfileStatus,
    ReferenceSource,
)
from app.profiler.bridge import bridge_id
from app.profiler.engine import refresh_taste_and_maybe_propose
from app.specs.service import sync_spec_routed_decision
from scripts import seed_profiler_presets

NS = uuid5(NAMESPACE_URL, "constructo.seed.design-loop-demo")

COMPANY_PHONE_OWNER = "+919820000001"
COMPANY_PHONE_CO_OWNER = "+919820000002"
COMPANY_PHONE_ARCHITECT = "+919820000020"


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


class _Counts:
    """Tiny created/updated/reused tracker, printed at the end like the
    presets seed does, so a second run visibly shows zero net-new rows."""

    def __init__(self) -> None:
        self.created = 0
        self.updated = 0
        self.reused = 0

    def as_dict(self) -> dict:
        return {"created": self.created, "updated": self.updated, "reused": self.reused}


async def _upsert(session, model, ident: UUID, counts: _Counts | None = None, **fields):
    """Insert-or-update a row by primary-key id (idempotent seeding)."""
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
        if counts is not None:
            counts.created += 1
    else:
        for key, value in fields.items():
            setattr(obj, key, value)
        if counts is not None:
            counts.updated += 1
    return obj


# The FakeLLM's canned theme/clarification output — kept identical shape to
# the real narrate_themes/generate_clarifications contract (app/profiler/brief.py,
# app/profiler/themes.py) so the engine's own persistence code runs unmodified.
_KITCHEN_CANNED = {
    "themes": [
        {
            "name": "Warm Contemporary",
            "palette": ["oak", "brass", "ivory"],
            "materials": ["light oak veneer", "brushed brass", "quartz"],
            "rationale": "Both contributors consistently favored warm, minimal kitchens.",
        }
    ],
    "questions": [
        "Do you want the brass hardware matte or polished?",
        "Should the island countertop match the perimeter counters or contrast?",
    ],
}


def _attrs_for(style: str, colors: list[str]) -> dict:
    return {"style": style, "colors": colors, "materials": [], "lighting": None, "confidence": 0.9}


async def seed() -> dict:  # noqa: PLR0912, PLR0915 — long but linear, mirrors seed_profiler_demo
    counts = _Counts()
    llm = FakeLLMClient(canned=_KITCHEN_CANNED)

    async with SessionLocal() as session:
        # --- Company + Site ---------------------------------------------------
        company = await _upsert(
            session, Company, _id("co"), counts,
            name="Neev Demo Homes",
        )
        await session.flush()

        site = await _upsert(
            session, Site, _id("site"), counts,
            company_id=company.id, name="Whitefield Residence",
            location="Whitefield, Bengaluru", type="residential", status="active",
        )
        await session.flush()
        site_id: UUID = site.id
        company_id: UUID = company.id

        # --- Users: homeowner owner + co-owner + architect ---------------------
        owner_user = await _upsert(
            session, User, _id("u", "owner"), counts,
            company_id=company_id, phone=COMPANY_PHONE_OWNER, role=UserRole.homeowner,
            name="Rahul Mehta (Owner)", language="en",
        )
        co_owner_user = await _upsert(
            session, User, _id("u", "co-owner"), counts,
            company_id=company_id, phone=COMPANY_PHONE_CO_OWNER, role=UserRole.homeowner,
            name="Priya Mehta (Co-owner)", language="en",
        )
        architect_user = await _upsert(
            session, User, _id("u", "architect"), counts,
            company_id=company_id, phone=COMPANY_PHONE_ARCHITECT, role=UserRole.architect,
            name="Anamika Sagar (Architect)", language="en",
        )
        await session.flush()

        # --- HomeownerMember rows (active, so member_sub_role resolves) --------
        owner_member = await _upsert(
            session, HomeownerMember, _id("hm", "owner"), counts,
            site_id=site_id, user_id=owner_user.id, sub_role=HomeownerSubRole.primary_owner,
            phone=COMPANY_PHONE_OWNER, status=MemberStatus.active, can_design=True,
        )
        co_owner_member = await _upsert(
            session, HomeownerMember, _id("hm", "co-owner"), counts,
            site_id=site_id, user_id=co_owner_user.id, sub_role=HomeownerSubRole.co_owner,
            phone=COMPANY_PHONE_CO_OWNER, status=MemberStatus.active, can_design=True,
        )
        await session.flush()

        # --- Spaces + Components (real anchors for areas / specs) --------------
        floor = await _upsert(
            session, Space, _id("space", "ground"), counts,
            site_id=site_id, parent_id=None, name="Ground Floor", kind=SpaceKind.floor, order=0,
        )
        await session.flush()

        kitchen_space = await _upsert(
            session, Space, _id("space", "kitchen"), counts,
            site_id=site_id, parent_id=floor.id, name="Kitchen", kind=SpaceKind.room, order=0,
        )
        living_space = await _upsert(
            session, Space, _id("space", "living"), counts,
            site_id=site_id, parent_id=floor.id, name="Living Room", kind=SpaceKind.room, order=1,
        )
        bedroom_space = await _upsert(
            session, Space, _id("space", "master-bedroom"), counts,
            site_id=site_id, parent_id=floor.id, name="Master Bedroom",
            kind=SpaceKind.room, order=2,
        )
        await session.flush()

        kitchen_component = await _upsert(
            session, Component, _id("comp", "kitchen-cabinets"), counts,
            space_id=kitchen_space.id, name="Cabinets", kind="finish",
            status=ComponentStatus.not_started,
        )
        living_component = await _upsert(
            session, Component, _id("comp", "living-finishes"), counts,
            space_id=living_space.id, name="Finishes", kind="finish",
            status=ComponentStatus.not_started,
        )
        await session.flush()

        # --- ProfilerProfile -----------------------------------------------------
        profile = await _upsert(
            session, ProfilerProfile, _id("profile"), counts,
            company_id=company_id, site_id=site_id, scope_type=ProfileScope.whole_house,
            status=ProfileStatus.architect_review, created_by=owner_user.id,
        )
        await session.flush()
        profile_id: UUID = profile.id

        # --- Contributors: owner + co-owner --------------------------------------
        contributor_owner = await _upsert(
            session, ProfilerContributor, _id("contrib", "owner"), counts,
            profile_id=profile_id, member_id=owner_member.id, user_id=owner_user.id,
            role=ContributorRole.owner, is_decision_owner=True,
        )
        contributor_co_owner = await _upsert(
            session, ProfilerContributor, _id("contrib", "co-owner"), counts,
            profile_id=profile_id, member_id=co_owner_member.id, user_id=co_owner_user.id,
            role=ContributorRole.co_owner, is_decision_owner=True,
        )
        await session.flush()

        # --- Areas ----------------------------------------------------------------
        kitchen_area = await _upsert(
            session, ProfilerArea, _id("area", "kitchen"), counts,
            profile_id=profile_id, area_kind=AreaKind.interior, area_key="kitchen",
            space_id=kitchen_space.id, component_id=kitchen_component.id,
            recommended_count=3,
        )
        living_area = await _upsert(
            session, ProfilerArea, _id("area", "living_room"), counts,
            profile_id=profile_id, area_kind=AreaKind.interior, area_key="living_room",
            space_id=living_space.id, component_id=living_component.id,
            recommended_count=3,
        )
        bedroom_area = await _upsert(
            session, ProfilerArea, _id("area", "master_bedroom"), counts,
            profile_id=profile_id, area_kind=AreaKind.interior, area_key="master_bedroom",
            space_id=bedroom_space.id, component_id=None,
            recommended_count=6,
        )
        await session.flush()

        # =====================================================================
        # KITCHEN — ranked past threshold by BOTH contributors, engine-real.
        # =====================================================================
        kitchen_refs: list[ProfilerReference] = []
        for i in range(3):
            ref = await _upsert(
                session, ProfilerReference, _id("ref", "kitchen", str(i)), counts,
                profile_id=profile_id, area_id=kitchen_area.id, contributor_id=contributor_owner.id,
                source_type=ReferenceSource.upload,
                image_r2_key=f"design/demo/kitchen-{i}.jpg",
            )
            kitchen_refs.append(ref)
        await session.flush()

        # Deterministic "vision extraction" (mirrors _run_vision's persisted
        # shape). Refs 0-1 read as warm/minimal (the converging majority
        # taste); ref 2 reads as "industrial" — a deliberate minority pick the
        # co-owner will reject below, so the area crosses the ranked-count
        # threshold (both contributors agree overall) while ALSO tripping
        # has_conflict=True, which is what makes the real engine ask
        # clarifying questions (propose_clarifications_for_area only fires
        # when confidence < 0.7 OR has_conflict — see app/profiler/engine.py).
        kitchen_styles = ["minimal", "minimal", "industrial"]
        for i, ref in enumerate(kitchen_refs):
            await _upsert(
                session, ProfilerReferenceAttributes, _id("refattr", "kitchen", str(i)), counts,
                reference_id=ref.id, attributes=_attrs_for(kitchen_styles[i], ["warm"]),
                confidence=0.9,
            )
        await session.flush()

        # Both contributors rank the two AGREED refs first (ranked_count=2,
        # still below recommended_count=3 — no propose yet).
        for i in (0, 1):
            await _upsert(
                session, ProfilerRanking, _id("rank", "kitchen", "owner", str(i)), counts,
                reference_id=kitchen_refs[i].id, contributor_id=contributor_owner.id, stars=5,
                tags={"positive": [], "negative": []},
            )
            await _upsert(
                session, ProfilerRanking, _id("rank", "kitchen", "co-owner", str(i)), counts,
                reference_id=kitchen_refs[i].id, contributor_id=contributor_co_owner.id, stars=5,
                tags={"positive": [], "negative": []},
            )
        await session.flush()
        await refresh_taste_and_maybe_propose(session, llm, profile_id, kitchen_area.id)
        await session.flush()

        # BOTH contributors rank the 3rd (industrial) ref — owner loves it,
        # co-owner rejects it — BEFORE the next engine call, so the SAME model
        # that first crosses ranked_count=3 (the threshold) already carries
        # has_conflict=True. This is what makes the real engine's threshold
        # branch also invoke propose_clarifications_for_area (confidence < 0.7
        # OR has_conflict) instead of silently debouncing on a later call.
        await _upsert(
            session, ProfilerRanking, _id("rank", "kitchen", "owner", "2"), counts,
            reference_id=kitchen_refs[2].id, contributor_id=contributor_owner.id, stars=5,
            tags={"positive": [], "negative": []},
        )
        await _upsert(
            session, ProfilerRanking, _id("rank", "kitchen", "co-owner", "2"), counts,
            reference_id=kitchen_refs[2].id, contributor_id=contributor_co_owner.id, stars=1,
            tags={"positive": [], "negative": []},
        )
        await session.flush()
        await refresh_taste_and_maybe_propose(session, llm, profile_id, kitchen_area.id)
        await session.commit()
        await session.refresh(kitchen_area)

        # Kitchen clarifications: the engine auto-proposed 2 via the FakeLLM's
        # canned ``questions`` above (has_conflict=True on the industrial pick
        # triggers propose_clarifications_for_area for real). Answer exactly
        # one of them so the demo shows both an answered and an open one.
        kitchen_clarifications = (
            await session.execute(
                select(ProfilerClarification)
                .where(ProfilerClarification.area_id == kitchen_area.id)
                .order_by(ProfilerClarification.asked_at)
            )
        ).scalars().all()
        if len(kitchen_clarifications) < 2:
            raise RuntimeError(
                f"expected >=2 engine-proposed kitchen clarifications, got "
                f"{len(kitchen_clarifications)} — has_conflict={kitchen_area.has_conflict} "
                f"confidence={kitchen_area.confidence}"
            )
        first_clarification = kitchen_clarifications[0]
        if first_clarification.answer is None:
            from datetime import UTC, datetime

            first_clarification.answer = "Please avoid high-gloss laminate — prefer matte finishes."
            first_clarification.answered_at = datetime.now(UTC)
        await session.commit()

        # =====================================================================
        # LIVING ROOM — 1 OPEN conflict + 1 deferred_to_architect conflict.
        # =====================================================================
        living_refs: list[ProfilerReference] = []
        for i in range(2):
            ref = await _upsert(
                session, ProfilerReference, _id("ref", "living", str(i)), counts,
                profile_id=profile_id, area_id=living_area.id, contributor_id=contributor_owner.id,
                source_type=ReferenceSource.upload,
                image_r2_key=f"design/demo/living-{i}.jpg",
            )
            living_refs.append(ref)
        await session.flush()

        # Both refs share the SAME (style, colors) pair — "industrial / grey" —
        # so detect_conflicts (per (dimension, value), summed across ALL
        # rankings of that value) yields exactly 2 conflict identities total:
        # one on dimension=style value=industrial, one on dimension=colors
        # value=grey. That gives us exactly one to leave OPEN and one to
        # resolve as deferred_to_architect below.
        await _upsert(
            session, ProfilerReferenceAttributes, _id("refattr", "living", "0"), counts,
            reference_id=living_refs[0].id, attributes=_attrs_for("industrial", ["grey"]),
            confidence=0.85,
        )
        await _upsert(
            session, ProfilerReferenceAttributes, _id("refattr", "living", "1"), counts,
            reference_id=living_refs[1].id, attributes=_attrs_for("industrial", ["grey"]),
            confidence=0.85,
        )
        await session.flush()

        # Owner loves both (5-star); co-owner dislikes both (1-star) — this
        # trips detect_conflicts's +/-0.5 threshold on style AND colors for
        # BOTH refs, giving us two independent conflict identities to work with.
        for i, ref in enumerate(living_refs):
            await _upsert(
                session, ProfilerRanking, _id("rank", "living", "owner", str(i)), counts,
                reference_id=ref.id, contributor_id=contributor_owner.id, stars=5,
                tags={"positive": [], "negative": []},
            )
        await session.flush()
        await refresh_taste_and_maybe_propose(session, llm, profile_id, living_area.id)
        await session.commit()

        for i, ref in enumerate(living_refs):
            await _upsert(
                session, ProfilerRanking, _id("rank", "living", "co-owner", str(i)), counts,
                reference_id=ref.id, contributor_id=contributor_co_owner.id, stars=1,
                tags={"positive": [], "negative": []},
            )
        await session.flush()
        await refresh_taste_and_maybe_propose(session, llm, profile_id, living_area.id)
        await session.commit()
        await session.refresh(living_area)

        # _sync_conflicts (inside refresh_taste_and_maybe_propose) just wrote a
        # fresh OPEN set for living_room: exactly 2 identities (style/industrial,
        # colors/grey — both refs share one (style, colors) pair, see above).
        # _sync_conflicts REPLACES the OPEN set on every call but PRESERVES
        # already-resolved/deferred rows — so on a re-run it re-detects
        # "colors/grey" as OPEN again (the underlying rankings never changed)
        # alongside the row we already deferred last run, i.e. a duplicate
        # identity in two different resolution_status buckets. Defer the
        # target deterministically (ordering by dimension, value) AND collapse
        # any duplicate OPEN row with the identical (dimension, value,
        # contributor_a, contributor_b) identity so re-running this block any
        # number of times converges to exactly 2 rows: one open, one deferred.
        living_conflicts = (
            await session.execute(
                select(ProfilerConflict)
                .where(ProfilerConflict.area_id == living_area.id)
                .order_by(ProfilerConflict.dimension, ProfilerConflict.value)
            )
        ).scalars().all()
        if len(living_conflicts) < 2:
            raise RuntimeError(
                f"expected 2 living_room conflict identities (style + colors), "
                f"got {len(living_conflicts)}: "
                f"{[(c.dimension, c.value, c.resolution_status) for c in living_conflicts]}"
            )
        from datetime import UTC, datetime

        defer_target = living_conflicts[0]
        defer_target.resolution_status = ConflictStatus.deferred_to_architect
        defer_target.resolved_by = architect_user.id
        defer_target.decision_note = "Bringing this to the design review — will propose a blend."
        defer_target.resolved_at = datetime.now(UTC)
        await session.flush()

        seen_identities: set[tuple] = set()
        for c in living_conflicts:
            identity = (c.dimension, c.value, c.contributor_a_id, c.contributor_b_id)
            if identity in seen_identities:
                await session.delete(c)  # duplicate re-detected OPEN row — collapse it
            else:
                seen_identities.add(identity)
        await session.commit()

        # =====================================================================
        # MASTER BEDROOM — 0 references (quick-start-entry demo).
        # =====================================================================
        # Nothing to seed: bedroom_area already exists with status=not_started
        # and zero references/rankings by construction.

        # =====================================================================
        # Brief v1 (request_changes) -> v2 (architect_review).
        # =====================================================================
        brief_v1_payload = {
            "scope_type": "whole_house",
            "areas": [
                {
                    "area_key": "kitchen", "confidence": 1.0, "has_conflict": False,
                    "dimensions": {}, "themes": [], "material_families": [],
                    "resolved_conflicts": [],
                },
            ],
        }
        brief_v1 = await _upsert(
            session, ProfilerBrief, _id("brief", "v1"), counts,
            profile_id=profile_id, version=1, state=BriefState.revision_requested,
            summary_json=brief_v1_payload, created_by=owner_user.id,
        )
        await session.flush()

        brief_v2_payload = {
            "scope_type": "whole_house",
            "areas": [
                {
                    "area_key": "kitchen", "confidence": 1.0, "has_conflict": False,
                    "dimensions": kitchen_area.taste_model or {},
                    "themes": [{"name": "Warm Contemporary", "palette": ["oak", "brass", "ivory"],
                                "materials": ["light oak veneer", "brushed brass", "quartz"]}],
                    "material_families": ["light oak veneer", "brushed brass", "quartz"],
                    "resolved_conflicts": [],
                },
                {
                    "area_key": "living_room", "confidence": float(living_area.confidence or 0.0),
                    "has_conflict": True, "dimensions": living_area.taste_model or {},
                    "themes": [], "material_families": [],
                    "resolved_conflicts": [
                        {
                            "dimension": "colors", "value": "grey",
                            "decision_note": (
                                "Bringing this to the design review — will propose a blend."
                            ),
                        },
                    ],
                },
                {
                    "area_key": "master_bedroom", "confidence": 0.0, "has_conflict": False,
                    "dimensions": {}, "themes": [], "material_families": [],
                    "resolved_conflicts": [],
                },
            ],
        }
        brief_v2 = await _upsert(
            session, ProfilerBrief, _id("brief", "v2"), counts,
            profile_id=profile_id, version=2, state=BriefState.architect_review,
            summary_json=brief_v2_payload, created_by=owner_user.id,
        )
        await session.flush()

        _brief_v2_audiences = (
            BriefAudience.homeowner, BriefAudience.architect, BriefAudience.contractor,
        )
        for audience in _brief_v2_audiences:
            await _upsert(
                session, ProfilerBriefRendering, _id("rendering", "v2", audience.value), counts,
                brief_id=brief_v2.id, audience=audience, scope="whole_house", area_id=None,
                content_json={
                    "areas": brief_v2_payload["areas"], "scope_type": "whole_house",
                    "narrative": {
                        "headline": "Your design brief is with the architect",
                        "summary": (
                            "Kitchen direction is locked in (Warm Contemporary). Living room "
                            "has one open preference gap the architect is reviewing."
                        ),
                        "sections": [],
                    },
                },
            )
        await session.flush()

        # Approval history: v1 request_changes (homeowner asked for a revision),
        # v2 send_to_architect (the resubmission now awaiting sign-off) — both
        # rows so GET /briefs/{id}/approvals shows a real back-and-forth.
        await _upsert(
            session, ProfilerBriefApproval, _id("approval", "v1", "request_changes"), counts,
            brief_id=brief_v1.id, actor_member_id=owner_member.id, actor_user_id=owner_user.id,
            actor_role="primary_owner", action=BriefAction.request_changes,
            note="Please firm up the living room direction before we sign off.",
        )
        await _upsert(
            session, ProfilerBriefApproval, _id("approval", "v2", "send_to_architect"), counts,
            brief_id=brief_v2.id, actor_member_id=owner_member.id, actor_user_id=owner_user.id,
            actor_role="primary_owner", action=BriefAction.send_to_architect,
            note="Kitchen is settled — sending the rest to you for review.",
        )
        await session.commit()

        # =====================================================================
        # Historical APPROVED brief -> 2 materialized + ROUTED specs -> 2
        # pending homeowner Decisions (spec_id + site_id + spec_label real).
        # =====================================================================
        historical_payload = {
            "scope_type": "whole_house",
            "areas": [
                {
                    "area_key": "kitchen", "confidence": 1.0, "has_conflict": False,
                    "dimensions": {}, "themes": [],
                    "material_families": ["light oak veneer", "brushed brass"],
                    "resolved_conflicts": [],
                },
            ],
        }
        historical_brief = await _upsert(
            session, ProfilerBrief, _id("brief", "historical"), counts,
            profile_id=profile_id, version=0, state=BriefState.approved,
            summary_json=historical_payload, created_by=owner_user.id,
        )
        await session.flush()
        await _upsert(
            session, ProfilerBriefApproval, _id("approval", "historical", "approve"), counts,
            brief_id=historical_brief.id, actor_member_id=owner_member.id,
            actor_user_id=owner_user.id, actor_role="primary_owner", action=BriefAction.approve,
            note="Approved — go ahead and order the kitchen materials.",
        )
        await session.commit()

        # Materialize via the SAME bridge the /briefs/{id}/materialize endpoint
        # uses (app.profiler.bridge.plan_proposals + bridge_id), so the Material
        # + Spec rows are byte-for-byte what that route would have produced.
        materials_by_name: dict[str, Material] = {}
        created_specs: list[Spec] = []
        for area in historical_payload["areas"]:
            for fam in area["material_families"]:
                mat_id = bridge_id("material", company_id, fam)
                material = materials_by_name.get(fam)
                if material is None:
                    material = await _upsert(
                        session, Material, mat_id, counts,
                        company_id=company_id, name=fam, category="design-brief",
                    )
                    materials_by_name[fam] = material
                await session.flush()

                spec_id = bridge_id("spec", kitchen_component.id, fam)
                spec = await _upsert(
                    session, Spec, spec_id, counts,
                    company_id=company_id, site_id=site_id, component_id=kitchen_component.id,
                    material_id=material.id, label=fam, qty=Decimal("1"), unit="lot",
                    notes="Proposed from the design brief — confirm.",
                    approval_status=SpecApprovalStatus.pending,
                )
                created_specs.append(spec)
        await session.commit()
        for s in created_specs:
            await session.refresh(s)

        # Route each spec exactly like POST /specs/{id}/route does — this is
        # the real bridge, not a hand-inserted Decision row, so spec_id/site_id
        # and the pending state are exactly what the router would produce.
        from datetime import UTC, datetime

        for spec in created_specs:
            if spec.sent_at is None:
                spec.sent_at = datetime.now(UTC)
                spec.approval_status = SpecApprovalStatus.pending
                spec.released_at = None
                await session.commit()
                await session.refresh(spec)
            await sync_spec_routed_decision(session, spec, architect_user)

        # --- Presets: real photos if the manifest exists, else gradients ------
        assets_dir = Path(__file__).resolve().parent.parent / "assets" / "presets"
        manifest_path = assets_dir / "manifest.json"
        if manifest_path.is_file():
            preset_result = await seed_profiler_presets.seed_from_manifest(assets_dir)
            preset_mode = f"from-dir:{assets_dir}"
        else:
            preset_result = await seed_profiler_presets.seed()
            preset_mode = "gradient"

    # Re-open a fresh session for the final read-only summary (post-commit
    # values only) so counting logic never fights the write session above.
    async with SessionLocal() as session:
        pending_decisions = (
            await session.execute(
                select(Decision).where(
                    Decision.site_id == site_id, Decision.spec_id.isnot(None)
                )
            )
        ).scalars().all()
        clarifications_total = (
            await session.execute(
                select(ProfilerClarification).where(ProfilerClarification.profile_id == profile_id)
            )
        ).scalars().all()
        themes_total = (
            await session.execute(
                select(ProfilerTheme).where(ProfilerTheme.profile_id == profile_id)
            )
        ).scalars().all()

    return {
        "counts": counts.as_dict(),
        "preset_seed": {"mode": preset_mode, **preset_result},
        "company_id": str(company_id),
        "site_id": str(site_id),
        "profile_id": str(profile_id),
        "kitchen_area_id": str(kitchen_area.id),
        "living_room_area_id": str(living_area.id),
        "master_bedroom_area_id": str(bedroom_area.id),
        "kitchen_themes_suggested": len(themes_total),
        "kitchen_clarifications": len(clarifications_total),
        "brief_v1_id": str(brief_v1.id),
        "brief_v2_id": str(brief_v2.id),
        "pending_spec_decisions": len(pending_decisions),
        "owner_phone": COMPANY_PHONE_OWNER,
        "co_owner_phone": COMPANY_PHONE_CO_OWNER,
        "architect_phone": COMPANY_PHONE_ARCHITECT,
    }


def main() -> None:
    result = asyncio.run(seed())
    print("Design-loop demo world seeded (company 'Neev Demo Homes'):")
    for k, v in result.items():
        print(f"  {k}: {v}")
    print()
    print("Login coordinates (dev OTP: 000000 for every phone below):")
    print(f"  Homeowner owner    : {result['owner_phone']}")
    print(f"  Homeowner co-owner : {result['co_owner_phone']}")
    print(f"  Architect          : {result['architect_phone']}")
    print()
    print("Re-run this script anytime — every row is upserted by a deterministic")
    print("uuid5 id, so a second run reports 0 'created' and only 'updated'/'reused'.")


if __name__ == "__main__":
    main()
