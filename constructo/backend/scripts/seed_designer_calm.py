"""Seed the Designer "Calm Cockpit" demo — company "CivilArch (Studio Demo)".

Run from the backend dir (backend/.env pointing at your dev DB):

    uv run python -m scripts.seed_designer_calm

Creates one company with a DESIGNER ("Anamika", role=architect) + an owner, three
sites, a spread of material SELECTIONS (specs in pending / approved / rejected),
and ONE design PROFILE (the homeowner brief) on Kutumb with areas, AI-drafted
themes, and an open conflict — so the designer surface lights up:

  - Home / Selections: specs to route (approve / hold).
  - Brief → DesignSite → dp: the profiler (areas, conflicts, theme decisions).

The architect sees ALL company sites (effective_visible_site_ids), so no
SiteAssignment rows are needed. IDEMPOTENT (uuid5). Login as the designer with
phone +919810000020 and dev OTP 000000.

NOTE: like the other Calm seeds, this runs ``Base.metadata.create_all`` (checkfirst)
so the Labs profiler tables exist even on a diverged dev-DB Alembic head.
"""

from __future__ import annotations

import asyncio
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid5

import app.models as models  # noqa: F401  register every table on Base.metadata
from app.db import Base, SessionLocal, engine
from app.models import (
    Company,
    Component,
    ComponentStatus,
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
    AreaStatus,
    ConflictStatus,
    ContributorRole,
    ProfilerArea,
    ProfilerConflict,
    ProfilerContributor,
    ProfilerProfile,
    ProfilerTheme,
    ProfileScope,
    ProfileStatus,
    ThemeStatus,
)

NS = uuid5(NAMESPACE_URL, "constructo.seed.civilarch-studio-demo")


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


async def _upsert(session, model, ident: UUID, **fields):
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
    return obj


SITES = [
    ("kutumb", "Kutumb Nivaas", "Gomti Nagar, Lucknow"),
    ("sharma", "Sharma Residence", "Indira Nagar, Lucknow"),
    ("agarwal", "Agarwal Villa", "Mahanagar, Lucknow"),
]


async def seed() -> dict[str, int]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    counts: dict[str, int] = {}
    async with SessionLocal() as session:
        company = await _upsert(session, Company, _id("co"), name="CivilArch (Studio Demo)")
        await session.flush()

        designer = await _upsert(
            session, User, _id("u", "anamika"), company_id=company.id,
            phone="+919810000020", role=UserRole.architect,
            name="Anamika Sagar (Designer)", language="en",
        )
        owner = await _upsert(
            session, User, _id("u", "owner"), company_id=company.id,
            phone="+919810000021", role=UserRole.owner,
            name="Saurabh Tripathi (Owner)", language="en",
        )
        await session.flush()
        counts["users"] = 2

        sites = {}
        comps = {}
        for skey, name, location in SITES:
            site = await _upsert(
                session, Site, _id("site", skey), company_id=company.id,
                name=name, location=location, type="residential", status="active",
            )
            sites[skey] = site
            space = await _upsert(
                session, Space, _id("space", skey), site_id=site.id,
                name="Interiors", kind=SpaceKind.zone, order=0,
            )
            await session.flush()
            comps[skey] = await _upsert(
                session, Component, _id("comp", skey), space_id=space.id,
                name="Finishes", kind="finish", status=ComponentStatus.in_progress,
            )
        await session.flush()
        counts["sites"] = len(sites)

        # --- Selections (specs) across the projects, in varied states ---
        def spec(key, skey, label, status, code, qty=None, unit=None):
            return _upsert(
                session, Spec, _id("spec", key), company_id=company.id,
                site_id=sites[skey].id, component_id=comps[skey].id, material_id=None,
                label=label, qty=Decimal(qty) if qty else None, unit=unit,
                approval_status=status, client_final_code=code, assignee_id=designer.id,
            )

        await spec("s1", "kutumb", "Master bath floor — imported tile", SpecApprovalStatus.rejected,
                   "Allmarble", "220", "sft")
        await spec("s2", "kutumb", "Kitchen counter — quartz slab", SpecApprovalStatus.pending,
                   "5141 Frosty Carrina", "18", "sft")
        await spec("s3", "kutumb", "Pooja back wall — marble cladding", SpecApprovalStatus.approved,
                   "Makrana White", "60", "sft")
        await spec("s4", "kutumb", "Living TV unit — veneer", SpecApprovalStatus.pending,
                   "Smoked Oak")
        await spec("s5", "sharma", "Wardrobe shutters — laminate", SpecApprovalStatus.pending,
                   "MR-2241 Walnut Ribbon", "24", "nos")
        await spec("s6", "sharma", "Living floor — vitrified tile", SpecApprovalStatus.approved,
                   "Eternity Statuario", "480", "sft")
        await spec("s7", "agarwal", "Master bed feature wall — wallpaper",
                   SpecApprovalStatus.pending, "Nilaya AB-09", "3", "rolls")
        await spec("s8", "agarwal", "Foyer floor — marble", SpecApprovalStatus.approved,
                   "Italian Botticino", "140", "sft")
        counts["selections"] = 8

        # --- Design profile (the homeowner brief) on Kutumb ---
        profile = await _upsert(
            session, ProfilerProfile, _id("dp", "kutumb"), company_id=company.id,
            site_id=sites["kutumb"].id, scope_type=ProfileScope.rooms,
            created_by=owner.id, status=ProfileStatus.theme_suggested,
        )
        await session.flush()
        await _upsert(
            session, ProfilerContributor, _id("dpc", "owner"), profile_id=profile.id,
            user_id=owner.id, role=ContributorRole.owner, is_decision_owner=True,
        )
        area_kitchen = await _upsert(
            session, ProfilerArea, _id("dpa", "kitchen"), profile_id=profile.id,
            area_kind=AreaKind.interior, area_key="kitchen", recommended_count=6,
            status=AreaStatus.in_progress, confidence=0.82, has_conflict=True,
        )
        area_living = await _upsert(
            session, ProfilerArea, _id("dpa", "living"), profile_id=profile.id,
            area_kind=AreaKind.interior, area_key="living_room", recommended_count=6,
            status=AreaStatus.ready, confidence=0.88, has_conflict=False,
        )
        await session.flush()
        await _upsert(
            session, ProfilerTheme, _id("dpt", "warm-min"), profile_id=profile.id,
            area_id=area_kitchen.id, name="Warm Minimal", confidence=0.82,
            palette=["warm oak", "matte brass", "off-white"],
            materials=["oak veneer", "quartz counter", "brushed brass"],
            rationale="Light oak cabinetry with brass accents and quartz reads warm yet minimal "
                      "— the consistent thread across the family's kitchen inspiration.",
            status=ThemeStatus.suggested,
        )
        await _upsert(
            session, ProfilerTheme, _id("dpt", "soft-scandi"), profile_id=profile.id,
            area_id=area_kitchen.id, name="Soft Scandi", confidence=0.64,
            palette=["cool grey", "pale birch", "white"],
            materials=["birch ply", "matte laminate", "stone composite"],
            rationale="A cooler, paler take if the family leans Scandinavian over warm-trad.",
            status=ThemeStatus.suggested,
        )
        await _upsert(
            session, ProfilerTheme, _id("dpt", "earthy"), profile_id=profile.id,
            area_id=area_living.id, name="Earthy Calm", confidence=0.88,
            palette=["terracotta", "olive", "sand"],
            materials=["lime plaster", "cane", "teak"],
            rationale="Grounded earth tones with natural cane and teak — relaxed and timeless.",
            status=ThemeStatus.approved,
        )
        await _upsert(
            session, ProfilerConflict, _id("dpx", "palette"), profile_id=profile.id,
            area_id=area_kitchen.id, dimension="palette",
            value="Warm oak vs cool grey kitchen cabinetry",
            resolution_status=ConflictStatus.open,
        )
        counts["design_profiles"] = 1

        await session.commit()
    return counts


if __name__ == "__main__":
    result = asyncio.run(seed())
    print("Seeded Designer Calm-Cockpit demo:", result)
    print("Login: phone +919810000020 · OTP 000000")
