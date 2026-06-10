"""Idempotent import of parsed spec rows into Space/Component/Material/Spec.

Deterministic uuid5 ids keyed on natural keys, so re-running the same sheet never
duplicates. Caller commits.
"""
from dataclasses import dataclass
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Component,
    ComponentStatus,
    Material,
    Space,
    SpaceKind,
    Spec,
    SpecApprovalStatus,
)
from app.specs.import_parser import ParsedSpecRow

_NS = uuid5(NAMESPACE_URL, "constructo.spec-import")


def _id(*parts: object) -> UUID:
    return uuid5(_NS, "|".join(str(p) for p in parts))


@dataclass
class ImportStats:
    spaces: int = 0
    components: int = 0
    materials: int = 0
    specs: int = 0


async def import_rows(
    session: AsyncSession, company_id: UUID, site_id: UUID, parsed: list[ParsedSpecRow]
) -> ImportStats:
    stats = ImportStats()

    async def _get_or_add(model, pk: UUID, **fields):
        existing = await session.get(model, pk)
        if existing is not None:
            return existing, False
        obj = model(id=pk, **fields)
        session.add(obj)
        await session.flush()
        return obj, True

    for r in parsed:
        # Space (room) — keyed by site + room name
        space_id = _id("space", site_id, r.room)
        _space, created = await _get_or_add(
            Space, space_id, site_id=site_id, name=r.room, kind=SpaceKind.room, order=0
        )
        stats.spaces += created

        # Component (finish element / wall) — keyed by space + element
        element = r.element or (r.category or "Item")
        comp_id = _id("component", space_id, element)
        _comp, created = await _get_or_add(
            Component, comp_id, space_id=space_id, name=element, kind=r.category,
            status=ComponentStatus.not_started,
        )
        stats.components += created

        # Material (catalog) — keyed by company + brand + sku (or name when sku missing)
        material_id = None
        if r.brand or r.sku or r.name:
            mat_id = _id("material", company_id, r.brand, r.sku or r.name)
            _mat, created = await _get_or_add(
                Material, mat_id, company_id=company_id, name=r.name or r.category or element,
                category=r.category, brand=r.brand, sku=r.sku, colour=r.colour, finish=r.finish,
                size=r.size, thickness=r.thickness,
            )
            stats.materials += created
            material_id = mat_id

        # Spec (the line item) — keyed by component + label(element) + sku
        spec_id = _id("spec", comp_id, element, r.sku or "")
        _spec, created = await _get_or_add(
            Spec, spec_id, company_id=company_id, site_id=site_id, component_id=comp_id,
            material_id=material_id, label=element, qty=r.qty, unit=r.unit,
            wastage_pct=r.wastage_pct, unit_rate=r.unit_rate,
            approval_status=SpecApprovalStatus(r.approval_status),
            notes=r.notes,
        )
        stats.specs += created

    return stats
