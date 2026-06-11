"""Material Specification line items (the Spec engine).

A Spec is a material instance bound to a component/wall. Reads are open to any
company member; create/edit is owner/pm/supervisor; approval is owner/pm.
Company-scoped, mirroring app/materials/router.py.
"""
import base64
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.extraction.llm import LLMClient
from app.models import Component, Material, Space, Spec, User, UserRole
from app.specs.costing import line_total as line_total_fn
from app.specs.costing import rollup_by_room
from app.specs.extraction import extract_material_from_image, get_llm
from app.specs.schemas import (
    DeskLine,
    DeskOut,
    DeskRoom,
    ExtractedSpecOut,
    RollupOut,
    SpecApprove,
    SpecCreate,
    SpecOut,
    SpecUpdate,
)

router = APIRouter(prefix="/api/v1/specs", tags=["specs"])

# Architect + Site Engineer (supervisor) maintain the spec; Architect/owner/pm approve.
_EDIT_ROLES = (UserRole.owner, UserRole.pm, UserRole.architect, UserRole.supervisor)
_APPROVE_ROLES = (UserRole.owner, UserRole.pm, UserRole.architect)


@router.get("", response_model=list[SpecOut])
async def list_specs(
    site_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[SpecOut]:
    stmt = (
        select(Spec)
        .where(Spec.company_id == user.company_id, Spec.site_id == site_id)
        .order_by(Spec.created_at)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [SpecOut.model_validate(s) for s in rows]


@router.post("", response_model=SpecOut, status_code=201)
async def create_spec(
    body: SpecCreate,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> SpecOut:
    spec = Spec(company_id=user.company_id, **body.model_dump())
    session.add(spec)
    await session.commit()
    await session.refresh(spec)
    return SpecOut.model_validate(spec)


@router.get("/rollup", response_model=RollupOut)
async def costing_rollup(
    site_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RollupOut:
    stmt = (
        select(Spec, Space.name)
        .join(Component, Component.id == Spec.component_id)
        .join(Space, Space.id == Component.space_id)
        .where(Spec.company_id == user.company_id, Spec.site_id == site_id)
    )
    rows = (await session.execute(stmt)).all()
    lines = [
        {"room": room_name, "qty": s.qty, "unit_rate": s.unit_rate, "wastage_pct": s.wastage_pct}
        for s, room_name in rows
    ]
    return RollupOut.model_validate(rollup_by_room(lines))


@router.post("/extract", response_model=ExtractedSpecOut, status_code=201)
async def extract_spec(
    site_id: UUID = Form(...),
    component_id: UUID = Form(...),
    image: UploadFile = File(...),
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> ExtractedSpecOut:
    raw = await image.read()
    mime = image.content_type or "image/jpeg"
    data_url = f"data:{mime};base64,{base64.b64encode(raw).decode()}"
    fields = await extract_material_from_image(llm, data_url)

    material = Material(
        company_id=user.company_id,
        name=fields.get("name") or fields.get("brand") or "Proposed material",
        category=fields.get("category"),
        brand=fields.get("brand"),
        sku=fields.get("product_code"),
        colour=fields.get("colour"),
        finish=fields.get("finish"),
        size=fields.get("size"),
        thickness=fields.get("thickness"),
    )
    session.add(material)
    await session.flush()

    spec = Spec(
        company_id=user.company_id,
        site_id=site_id,
        component_id=component_id,
        material_id=material.id,
        label=fields.get("category") or "Proposed",
        notes="Proposed from a photo — confirm.",
    )
    session.add(spec)
    await session.commit()
    await session.refresh(spec)
    return ExtractedSpecOut(spec=SpecOut.model_validate(spec), extracted=fields)


@router.get("/desk", response_model=DeskOut)
async def spec_desk(
    site_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DeskOut:
    stmt = (
        select(Spec, Component.name, Component.location, Space.name, Material)
        .join(Component, Component.id == Spec.component_id)
        .join(Space, Space.id == Component.space_id)
        .outerjoin(Material, Material.id == Spec.material_id)
        .where(Spec.company_id == user.company_id, Spec.site_id == site_id)
        .order_by(Space.name, Spec.created_at)
    )
    rows = (await session.execute(stmt)).all()

    rooms_map: dict[str, dict] = {}
    excluded_total = 0
    for spec, comp_name, comp_location, space_name, material in rows:
        lt = line_total_fn(spec.qty, spec.unit_rate, spec.wastage_pct)
        category = (material.category if material is not None else None) or spec.label
        line = DeskLine(
            id=spec.id,
            element=comp_name,
            location=comp_location,
            category=category,
            brand=material.brand if material is not None else None,
            sku=material.sku if material is not None else None,
            colour=material.colour if material is not None else None,
            finish=material.finish if material is not None else None,
            qty=spec.qty,
            unit=spec.unit,
            wastage_pct=spec.wastage_pct,
            unit_rate=spec.unit_rate,
            line_total=lt,
            approval_status=spec.approval_status,
            client_final_code=spec.client_final_code,
        )
        bucket = rooms_map.setdefault(
            space_name,
            {"room": space_name, "total": Decimal("0.00"), "excluded": 0, "lines": []},
        )
        bucket["lines"].append(line)
        if lt is None:
            bucket["excluded"] += 1
            excluded_total += 1
        else:
            bucket["total"] += lt

    room_list = [
        DeskRoom(room=v["room"], total=v["total"], excluded=v["excluded"], lines=v["lines"])
        for v in rooms_map.values()
    ]
    grand_total = sum((r.total for r in room_list), Decimal("0.00"))
    return DeskOut(rooms=room_list, grand_total=grand_total, excluded_total=excluded_total)


@router.get("/{spec_id}", response_model=SpecOut)
async def get_spec(
    spec_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SpecOut:
    spec = await session.get(Spec, spec_id)
    if spec is None or spec.company_id != user.company_id:
        raise AppError(404, "not_found", "Spec not found")
    return SpecOut.model_validate(spec)


@router.patch("/{spec_id}", response_model=SpecOut)
async def update_spec(
    spec_id: UUID,
    body: SpecUpdate,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> SpecOut:
    spec = await session.get(Spec, spec_id)
    if spec is None or spec.company_id != user.company_id:
        raise AppError(404, "not_found", "Spec not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(spec, field, value)
    await session.commit()
    await session.refresh(spec)
    return SpecOut.model_validate(spec)


@router.post("/{spec_id}/approve", response_model=SpecOut)
async def approve_spec(
    spec_id: UUID,
    body: SpecApprove,
    user: User = Depends(require_role(*_APPROVE_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> SpecOut:
    spec = await session.get(Spec, spec_id)
    if spec is None or spec.company_id != user.company_id:
        raise AppError(404, "not_found", "Spec not found")
    spec.approval_status = body.status
    if body.client_final_code is not None:
        spec.client_final_code = body.client_final_code
    await session.commit()
    await session.refresh(spec)
    return SpecOut.model_validate(spec)
