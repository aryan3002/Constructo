"""End-to-end: a clashing spec fires material_theme_clash through the engine —
proves the spec->material->area joins in design_inputs resolve correctly."""
from datetime import date

from sqlalchemy import select

from app.intelligence.engine import run_site
from app.models import (
    AreaKind,
    Component,
    Material,
    ProfilerArea,
    ProfilerProfile,
    SiteFinding,
    Space,
    SpaceKind,
    Spec,
)

TODAY = date(2026, 6, 25)


async def test_material_theme_clash_fires_through_engine(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)

    space = Space(site_id=site.id, name="Kitchen", kind=SpaceKind.room)
    db_session.add(space)
    await db_session.flush()
    comp = Component(space_id=space.id, name="Countertop")
    db_session.add(comp)
    await db_session.flush()
    mat = Material(company_id=company.id, name="Slab", colour="Charcoal Black", finish="matte")
    db_session.add(mat)
    await db_session.flush()
    db_session.add(Spec(
        company_id=company.id, site_id=site.id, component_id=comp.id,
        material_id=mat.id, label="Counter",
    ))
    profile = ProfilerProfile(company_id=company.id, site_id=site.id)
    db_session.add(profile)
    await db_session.flush()
    # homeowner's taste for the kitchen dislikes dark; the charcoal counter clashes
    db_session.add(ProfilerArea(
        profile_id=profile.id, area_kind=AreaKind.interior, area_key="kitchen",
        component_id=comp.id,
        taste_model={"dimensions": {"colors": {"dark": -1.0, "light": 1.0}}},
    ))
    await db_session.flush()

    result = await run_site(db_session, site.id, today=TODAY)

    assert "material_theme_clash" in {f.finding_type for f in result.findings}
    rows = (
        await db_session.execute(
            select(SiteFinding).where(
                SiteFinding.site_id == site.id,
                SiteFinding.finding_type == "material_theme_clash",
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].phase == "design"
