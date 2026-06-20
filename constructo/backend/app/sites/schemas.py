"""Pydantic request/response schemas for the Sites module.

Endpoints never return ORM objects directly; they map to these models.
"""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import UserRole

# ---- companies -------------------------------------------------------------


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1)


class CompanyOut(BaseModel):
    id: UUID
    name: str


# ---- sites -----------------------------------------------------------------


class SiteCreate(BaseModel):
    name: str = Field(min_length=1)
    type: str = Field(min_length=1)
    location: str | None = None
    status: str | None = None


class SiteUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    location: str | None = None
    status: str | None = None


class SiteOut(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    type: str | None
    location: str | None
    status: str | None


# ---- site baseline ---------------------------------------------------------


class SiteBaselineIn(BaseModel):
    """Set the per-site expected daily headcount so labor-shortfall can fire.

    ``expected_daily_headcount`` must be a positive integer; pass ``None`` to
    clear it (reverting the site to the auto-learn / day-over-day fallbacks).
    """

    expected_daily_headcount: int | None = Field(default=None, ge=1)
    notes: str | None = None


class SiteBaselineOut(BaseModel):
    site_id: UUID
    expected_daily_headcount: int | None
    notes: str | None
    updated_at: datetime


# ---- users -----------------------------------------------------------------


class UserCreate(BaseModel):
    phone: str = Field(min_length=1)
    role: UserRole
    name: str | None = None


class UserUpdate(BaseModel):
    """Owner-only team edit (W4.3). Partial — only provided fields change."""

    role: UserRole | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    id: UUID
    company_id: UUID
    name: str | None
    phone: str
    role: UserRole
    is_active: bool = True


# ---- assignment ------------------------------------------------------------


class SiteAssignIn(BaseModel):
    user_id: UUID


class OkOut(BaseModel):
    ok: bool = True


# ---- whatsapp groups -------------------------------------------------------


class WhatsappGroupCreate(BaseModel):
    external_group_id: str = Field(min_length=1)
    source: str = Field(min_length=1)
    site_id: UUID | None = None
    label: str | None = None


class WhatsappGroupOut(BaseModel):
    id: UUID
    company_id: UUID
    site_id: UUID | None
    external_group_id: str
    source: str
    label: str | None


# ---- site events (read) ----------------------------------------------------


class SiteEventOut(BaseModel):
    """Read-shape for a persisted site event (matches the SiteEvent contract)."""

    id: UUID
    site_id: UUID
    event_type: str
    occurred_on: date
    summary: str
    fields: dict
    confidence: float
    needs_clarification: bool
    source_message_ids: list[UUID]
    version: int
    supersedes_event_id: UUID | None
    created_at: datetime


class SitePhotoOut(BaseModel):
    """A site photo for the owner 'Latest from site' strip (presigned URL)."""

    id: UUID
    site_id: UUID
    image_url: str
    caption: str | None
    room_tag: str | None
    published_at: datetime
