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
