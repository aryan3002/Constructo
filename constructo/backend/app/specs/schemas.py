from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import SpecApprovalStatus


class SpecCreate(BaseModel):
    site_id: UUID
    component_id: UUID
    material_id: UUID | None = None
    label: str = Field(min_length=1, max_length=200)
    qty: Decimal | None = None
    unit: str | None = Field(default=None, max_length=32)
    wastage_pct: Decimal | None = None
    unit_rate: Decimal | None = None
    client_final_code: str | None = Field(default=None, max_length=200)
    assignee_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)


class SpecUpdate(BaseModel):
    material_id: UUID | None = None
    label: str | None = Field(default=None, min_length=1, max_length=200)
    qty: Decimal | None = None
    unit: str | None = Field(default=None, max_length=32)
    wastage_pct: Decimal | None = None
    unit_rate: Decimal | None = None
    client_final_code: str | None = Field(default=None, max_length=200)
    assignee_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)


class SpecApprove(BaseModel):
    status: SpecApprovalStatus
    client_final_code: str | None = Field(default=None, max_length=200)


class SpecOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    site_id: UUID
    component_id: UUID
    material_id: UUID | None
    label: str
    qty: Decimal | None
    unit: str | None
    wastage_pct: Decimal | None
    unit_rate: Decimal | None
    approval_status: SpecApprovalStatus
    client_final_code: str | None
    assignee_id: UUID | None
    notes: str | None
    created_at: datetime


class RoomRollup(BaseModel):
    room: str
    total: Decimal
    lines: int
    excluded: int


class RollupOut(BaseModel):
    rooms: list[RoomRollup]
    grand_total: Decimal
    excluded_total: int


class ExtractedSpecOut(BaseModel):
    spec: SpecOut
    extracted: dict


class DeskLine(BaseModel):
    id: UUID
    element: str  # Component.name
    location: str | None  # Component.location
    category: str | None  # Material.category (fallback Spec.label)
    brand: str | None  # Material.brand
    sku: str | None  # Material.sku
    colour: str | None  # Material.colour
    finish: str | None  # Material.finish
    qty: Decimal | None
    unit: str | None
    wastage_pct: Decimal | None
    unit_rate: Decimal | None
    line_total: Decimal | None  # costing.line_total(qty, unit_rate, wastage_pct)
    approval_status: SpecApprovalStatus
    client_final_code: str | None


class DeskRoom(BaseModel):
    room: str
    total: Decimal  # sum of non-null line_totals in the room
    excluded: int  # count of lines with no line_total (unpriced)
    lines: list[DeskLine]


class DeskOut(BaseModel):
    rooms: list[DeskRoom]
    grand_total: Decimal
    excluded_total: int
