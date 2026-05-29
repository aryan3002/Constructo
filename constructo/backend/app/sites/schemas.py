"""Pydantic request/response schemas for the Sites module.

Endpoints never return ORM objects directly; they map to these models.
"""
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


# ---- users -----------------------------------------------------------------


class UserCreate(BaseModel):
    phone: str = Field(min_length=1)
    role: UserRole
    name: str | None = None


class UserOut(BaseModel):
    id: UUID
    company_id: UUID
    name: str | None
    phone: str
    role: UserRole


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
