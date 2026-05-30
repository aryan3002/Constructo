"""Pydantic request/response schemas for the Permits module.

Tracks a permit/NOC through its authority workflow
(not_started -> applied -> under_review -> approved / rejected / expired) and the
key dates the expiry/renewal sweep reasons over. Endpoints never return ORM
objects directly.
"""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import PermitStatus


class PermitCreate(BaseModel):
    site_id: UUID
    permit_type: str = Field(min_length=1)
    authority: str = Field(min_length=1)
    status: PermitStatus | None = None
    applied_on: date | None = None
    expected_on: date | None = None
    decided_on: date | None = None
    expiry_on: date | None = None
    reference_no: str | None = None
    notes: str | None = None


class PermitUpdate(BaseModel):
    permit_type: str | None = Field(default=None, min_length=1)
    authority: str | None = Field(default=None, min_length=1)
    status: PermitStatus | None = None
    applied_on: date | None = None
    expected_on: date | None = None
    decided_on: date | None = None
    expiry_on: date | None = None
    reference_no: str | None = None
    notes: str | None = None


class PermitOut(BaseModel):
    id: UUID
    company_id: UUID
    site_id: UUID
    permit_type: str
    authority: str
    status: PermitStatus
    applied_on: date | None
    expected_on: date | None
    decided_on: date | None
    expiry_on: date | None
    reference_no: str | None
    notes: str | None
    created_by: UUID | None
    created_at: datetime
