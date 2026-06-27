"""Load + resolve the design-fidelity detector inputs for a site.

Bridges the operational tables (specs/materials, published photos) to the Design
Profiler's per-area ``taste_model``:
  - specs  -> their material's colour/finish, area resolved via component_id
  - photos -> area resolved by room_tag == area_key
  - areas  -> profiler_areas (with taste) for the site, via the profile

Returns the ORM-decoupled rows the pure detectors consume. Empty/`None` area
links are fine — the detectors abstain on them.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.intelligence.detectors.design import AreaTaste, PhotoRow, SpecRow
from app.models import Material, ProfilerArea, ProfilerProfile, PublishedPhoto, Spec

# Bound the vision cost: only the most-recent published photos are considered for
# photo_vs_theme (and only those whose room_tag maps to a taste-bearing area).
_PHOTO_LIMIT = 10


async def load_design_inputs(
    session: AsyncSession, site_id: UUID
) -> tuple[list[SpecRow], list[PhotoRow], list[AreaTaste]]:
    area_rows = (
        (
            await session.execute(
                select(ProfilerArea)
                .join(ProfilerProfile, ProfilerProfile.id == ProfilerArea.profile_id)
                .where(ProfilerProfile.site_id == site_id)
            )
        )
        .scalars()
        .all()
    )
    areas = [
        AreaTaste(area_key=a.area_key, dimensions=(a.taste_model or {}).get("dimensions", {}))
        for a in area_rows
    ]
    comp_to_area = {a.component_id: a.area_key for a in area_rows if a.component_id}
    key_lower = {a.area_key.lower(): a.area_key for a in area_rows}

    spec_pairs = (
        await session.execute(
            select(Spec, Material)
            .join(Material, Material.id == Spec.material_id, isouter=True)
            .where(Spec.site_id == site_id)
        )
    ).all()
    specs = [
        SpecRow(
            id=str(spec.id),
            label=spec.label,
            colour=mat.colour if mat else None,
            finish=mat.finish if mat else None,
            material=mat.name if mat else None,
            area_key=comp_to_area.get(spec.component_id),
        )
        for spec, mat in spec_pairs
    ]

    photo_rows = (
        (
            await session.execute(
                select(PublishedPhoto)
                .where(PublishedPhoto.site_id == site_id)
                .order_by(PublishedPhoto.published_at.desc())
                .limit(_PHOTO_LIMIT)
            )
        )
        .scalars()
        .all()
    )
    photos = [
        PhotoRow(
            id=str(p.id),
            image_url=p.image_url,
            area_key=key_lower.get((p.room_tag or "").lower()) if p.room_tag else None,
        )
        for p in photo_rows
    ]

    return specs, photos, areas
