from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models import SpecApprovalStatus

# The designer's selection routing — DERIVED from approval_status + sent_at +
# released_at, so the owner's plain approval flow is never disturbed.
RoutingStatus = str  # "draft" | "out_for_approval" | "approved" | "returned" | "released"


def _routing_status(approval: SpecApprovalStatus, sent_at, released_at) -> RoutingStatus:
    if released_at is not None:
        return "released"
    if approval == SpecApprovalStatus.rejected:
        return "returned"
    if approval == SpecApprovalStatus.approved:
        return "approved"
    if sent_at is not None:
        return "out_for_approval"
    return "draft"


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
    sent_at: datetime | None
    released_at: datetime | None
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def routing_status(self) -> RoutingStatus:
        """The designer selection state, derived from approval + route stamps."""
        return _routing_status(self.approval_status, self.sent_at, self.released_at)


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
