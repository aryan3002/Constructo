"""Seed Design Profiler demo data onto the existing SUNRISE-HOME homeowner site.

Looks up the SUNRISE-HOME HomeownerMember (and its site + company) from the DB,
then seeds a full profiler profile, areas, contributor, references, rankings,
theme, brief, and brief renderings — all with deterministic uuid5 ids so
re-running upserts in-place rather than duplicating.

Creates Kitchen and Living Room spaces for the site if they do not already exist
(the SUNRISE-HOME site in the pilot DB has no spaces yet).

Run from the backend dir:

    uv run python -m scripts.seed_profiler_demo

IDEMPOTENT: every row uses a deterministic uuid5 id — re-running upserts
in place rather than duplicating.
"""

from __future__ import annotations

import asyncio
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.models import (
    Company,
    Component,
    ComponentStatus,
    HomeownerMember,
    Site,
    Space,
    SpaceKind,
    User,
    UserRole,
)
from app.models.profiler import (
    AreaKind,
    AreaStatus,
    BriefAudience,
    BriefState,
    ContributorRole,
    ProfilerArea,
    ProfilerBrief,
    ProfilerBriefRendering,
    ProfilerContributor,
    ProfilerProfile,
    ProfilerRanking,
    ProfilerReference,
    ProfilerTheme,
    ProfileScope,
    ProfileStatus,
    ReferenceSource,
    ThemeStatus,
)

# Profiler-specific namespace — independent of seed_demo.
NS = uuid5(NAMESPACE_URL, "constructo.seed.sunrise-profiler")


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


async def _upsert(session, model, ident: UUID, **fields):
    """Insert-or-update a row by primary-key id (idempotent seeding)."""
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for key, value in fields.items():
            setattr(obj, key, value)
    return obj


async def seed() -> dict:  # noqa: PLR0912,PLR0915 — long but linear
    async with SessionLocal() as session:
        # --- Resolve SUNRISE-HOME anchor rows --------------------------------
        member = (
            await session.execute(
                select(HomeownerMember).where(HomeownerMember.join_code == "SUNRISE-HOME")
            )
        ).scalar_one_or_none()
        if member is None:
            raise RuntimeError(
                "HomeownerMember with join_code='SUNRISE-HOME' not found in DB. "
                "Create it first (run seed_demo.py or create the invite from the app)."
            )
        site = await session.get(Site, member.site_id)
        if site is None:
            raise RuntimeError(f"Site {member.site_id} not found")
        company = await session.get(Company, site.company_id)
        if company is None:
            raise RuntimeError(f"Company {site.company_id} not found")

        # Owner user: pick the first owner-role user in the site's company.
        owner_user = (
            await session.execute(
                select(User).where(
                    User.company_id == site.company_id,
                    User.role == UserRole.owner,
                )
            )
        ).scalars().first()
        if owner_user is None:
            raise RuntimeError(f"No owner user found for company {site.company_id}")

        site_id: UUID = site.id
        company_id: UUID = site.company_id
        member_id: UUID = member.id
        owner_user_id: UUID = owner_user.id

        # --- Ensure spaces exist for the site --------------------------------
        # The pilot SUNRISE-HOME site has no spaces — create Ground Floor +
        # Living Room + Kitchen so the profiler areas have real space_ids.
        floor_id = _id("space", str(site_id), "ground")
        floor = await session.get(Space, floor_id)
        if floor is None:
            floor = Space(
                id=floor_id,
                site_id=site_id,
                parent_id=None,
                name="Ground Floor",
                kind=SpaceKind.floor,
                order=0,
            )
            session.add(floor)
        await session.flush()

        living_space_id = _id("space", str(site_id), "living")
        living_space = await session.get(Space, living_space_id)
        if living_space is None:
            living_space = Space(
                id=living_space_id,
                site_id=site_id,
                parent_id=floor_id,
                name="Living Room",
                kind=SpaceKind.room,
                order=0,
            )
            session.add(living_space)

        kitchen_space_id = _id("space", str(site_id), "kitchen")
        kitchen_space = await session.get(Space, kitchen_space_id)
        if kitchen_space is None:
            kitchen_space = Space(
                id=kitchen_space_id,
                site_id=site_id,
                parent_id=floor_id,
                name="Kitchen",
                kind=SpaceKind.room,
                order=1,
            )
            session.add(kitchen_space)
        await session.flush()

        # Kitchen cabinets component (so materialize can bridge to a real component).
        kitchen_cab_component_id = _id("component", str(kitchen_space_id), "cabinets")
        await _upsert(
            session,
            Component,
            kitchen_cab_component_id,
            space_id=kitchen_space_id,
            name="Cabinets",
            kind=None,
            status=ComponentStatus.not_started,
        )
        await session.flush()

        # --- ProfilerProfile -------------------------------------------------
        profile_id = _id("profiler", str(site_id), "profile")
        await _upsert(
            session,
            ProfilerProfile,
            profile_id,
            company_id=company_id,
            site_id=site_id,
            scope_type=ProfileScope.whole_house,
            status=ProfileStatus.intake_started,
            created_by=owner_user_id,
        )
        await session.flush()

        # --- ProfilerArea: kitchen -------------------------------------------
        kitchen_area_id = _id("profiler", str(profile_id), "area", "kitchen")
        await _upsert(
            session,
            ProfilerArea,
            kitchen_area_id,
            profile_id=profile_id,
            area_kind=AreaKind.interior,
            area_key="kitchen",
            space_id=kitchen_space_id,
            component_id=kitchen_cab_component_id,
            recommended_count=3,
            status=AreaStatus.in_progress,
            confidence=1.0,
            has_conflict=False,
            taste_model={
                "style": {"warm_minimal": 1.0},
                "palette": {"oak": 0.9, "beige": 0.8, "stone": 0.7},
                "materials": {"light oak": 0.9, "matte brass": 0.8, "quartz": 0.7},
            },
        )

        # --- ProfilerArea: living_room ----------------------------------------
        living_area_id = _id("profiler", str(profile_id), "area", "living_room")
        await _upsert(
            session,
            ProfilerArea,
            living_area_id,
            profile_id=profile_id,
            area_kind=AreaKind.interior,
            area_key="living_room",
            space_id=living_space_id,
            component_id=None,
            recommended_count=3,
            status=AreaStatus.not_started,
            confidence=0.0,
            has_conflict=False,
            taste_model={},
        )
        await session.flush()

        # --- ProfilerContributor: the SUNRISE-HOME member --------------------
        # member_id-based so _my_contributor_id resolves even before user_id
        # is available (before first login). If the member is already active
        # (user_id set), we also set user_id for direct lookup.
        contributor_id = _id("profiler", str(profile_id), "contributor", "primary")
        await _upsert(
            session,
            ProfilerContributor,
            contributor_id,
            profile_id=profile_id,
            member_id=member_id,
            user_id=member.user_id,  # may be non-null if already redeemed
            role=ContributorRole.owner,
            is_decision_owner=True,
        )
        await session.flush()

        # --- ProfilerReference: 3 references for kitchen --------------------
        ref_urls = [
            "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136",
            "https://images.unsplash.com/photo-1600585152220-90363fe7e115",
            "https://images.unsplash.com/photo-1556909172-8c2f041fca1e",
        ]
        ref_ids: list[UUID] = []
        for i, url in enumerate(ref_urls):
            ref_id = _id("profiler", str(kitchen_area_id), "reference", str(i))
            await _upsert(
                session,
                ProfilerReference,
                ref_id,
                profile_id=profile_id,
                area_id=kitchen_area_id,
                contributor_id=contributor_id,
                source_type=ReferenceSource.upload,
                source_url=url,
            )
            ref_ids.append(ref_id)
        await session.flush()

        # --- ProfilerRanking: stars 5 + 4 on first two refs ------------------
        for i, stars in enumerate([5, 4]):
            ranking_id = _id("profiler", str(kitchen_area_id), "ranking", str(i))
            await _upsert(
                session,
                ProfilerRanking,
                ranking_id,
                reference_id=ref_ids[i],
                contributor_id=contributor_id,
                stars=stars,
                tags={"positive": [], "negative": []},
            )
        await session.flush()

        # --- ProfilerTheme: "Warm Minimal" for kitchen -----------------------
        theme_id = _id("profiler", str(kitchen_area_id), "theme", "warm-minimal")
        await _upsert(
            session,
            ProfilerTheme,
            theme_id,
            profile_id=profile_id,
            area_id=kitchen_area_id,
            name="Warm Minimal",
            status=ThemeStatus.approved,
            palette=["oak", "beige", "stone"],
            materials=["light oak", "matte brass", "quartz"],
            confidence=1.0,
            evidence_reference_ids=[str(r) for r in ref_ids],
            rationale=(
                "Clean lines with warm natural materials — light oak cabinetry, "
                "matte brass fixtures, and quartz countertops in a neutral palette."
            ),
        )
        await session.flush()

        # --- ProfilerBrief ---------------------------------------------------
        brief_areas = [
            {
                "area_key": "kitchen",
                "confidence": 1.0,
                "has_conflict": False,
                "dimensions": {
                    "style": {"warm_minimal": 1.0},
                    "palette": {"oak": 0.9, "beige": 0.8, "stone": 0.7},
                    "materials": {"light oak": 0.9, "matte brass": 0.8, "quartz": 0.7},
                },
                "themes": [
                    {
                        "name": "Warm Minimal",
                        "palette": ["oak", "beige", "stone"],
                        "materials": ["light oak", "matte brass", "quartz"],
                        "status": "approved",
                    }
                ],
                "material_families": ["light oak", "matte brass", "quartz"],
                "resolved_conflicts": [],
            },
            {
                "area_key": "living_room",
                "confidence": 0.0,
                "has_conflict": False,
                "dimensions": {},
                "themes": [],
                "material_families": [],
                "resolved_conflicts": [],
            },
        ]
        summary_json = {
            "scope_type": "whole_house",
            "areas": brief_areas,
        }

        brief_id = _id("profiler", str(profile_id), "brief")
        await _upsert(
            session,
            ProfilerBrief,
            brief_id,
            profile_id=profile_id,
            version=1,
            state=BriefState.homeowner_review,
            summary_json=summary_json,
            created_by=owner_user_id,
        )
        await session.flush()

        # --- ProfilerBriefRendering: 3 audience renderings -------------------
        narratives = {
            BriefAudience.homeowner: {
                "headline": "Your kitchen is taking shape — Warm Minimal",
                "summary": (
                    "Based on your inspiration images, we see a consistent vision: "
                    "light oak cabinetry, matte brass accents, and quartz countertops "
                    "in a warm, minimal aesthetic. Your living room inputs are still "
                    "being collected."
                ),
                "sections": [
                    {"title": "Materials", "body": "Light oak, matte brass, quartz."},
                    {"title": "Palette", "body": "Oak, beige, stone — warm and grounded."},
                ],
            },
            BriefAudience.architect: {
                "headline": "Design Intent: Warm Minimal — Kitchen Brief",
                "summary": (
                    "Client preference is firmly in the warm-minimal register. "
                    "High confidence (1.0) from 2 ranked references. "
                    "Specify light oak veneer cabinetry, matte brass hardware, "
                    "and engineered quartz tops. Living room intake pending."
                ),
                "sections": [
                    {"title": "Materials", "body": "Light oak, matte brass, quartz."},
                    {
                        "title": "Confidence",
                        "body": "Kitchen: 1.0 (strong). Living room: 0.0 (pending).",
                    },
                ],
            },
            BriefAudience.contractor: {
                "headline": "Contractor Brief — Kitchen",
                "summary": (
                    "Supply and install light oak cabinetry with matte brass hardware; "
                    "engineer quartz countertops. No conflicts. Living room scope TBD."
                ),
                "sections": [
                    {"title": "Materials", "body": "Light oak, matte brass, quartz."},
                ],
            },
        }
        for aud, narrative in narratives.items():
            rendering_id = _id("profiler", str(brief_id), "rendering", aud.value)
            content_json = {
                "areas": brief_areas,
                "scope_type": "whole_house",
                "narrative": narrative,
            }
            await _upsert(
                session,
                ProfilerBriefRendering,
                rendering_id,
                brief_id=brief_id,
                audience=aud,
                scope="whole_house",
                area_id=None,
                content_json=content_json,
            )

        await session.commit()

    return {
        "site_id": str(site_id),
        "company_name": company.name,
        "profile_id": str(profile_id),
        "kitchen_area_id": str(kitchen_area_id),
        "living_room_area_id": str(living_area_id),
        "contributor_id": str(contributor_id),
        "member_id": str(member_id),
        "member_user_id": str(member.user_id) if member.user_id else None,
        "member_phone": member.phone,
        "brief_id": str(brief_id),
        "ref_ids": [str(r) for r in ref_ids],
    }


def main() -> None:
    result = asyncio.run(seed())
    print("Design Profiler demo data seeded for SUNRISE-HOME:")
    for k, v in result.items():
        print(f"  {k}: {v}")
    print()
    phone = result["member_phone"] or "+919811112222"
    print(f"Login: join code SUNRISE-HOME  phone: {phone}  otp: 000000")
    print("(If already redeemed, use POST /api/v1/auth/login with the same phone)")


if __name__ == "__main__":
    main()
