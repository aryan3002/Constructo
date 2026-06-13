"""Pydantic request/response schemas for the Audit module.

Endpoints never return ORM objects directly — everything maps to a ``*Out``.
"""
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import AuditStatus, FindingSeverity, FindingStatus


class AuditCreate(BaseModel):
    site_id: UUID
    sections: list[str] = Field(min_length=1)
    scheduled_for: Literal["today", "this_week"] = "today"
    conducted_by: UUID | None = None


class AuditUpdate(BaseModel):
    status: AuditStatus | None = None
    conducted_by: UUID | None = None
    conducted_at: datetime | None = None


class SectionItem(BaseModel):
    label: str
    status: Literal["ok", "obs", "fail"]


class SectionUpsert(BaseModel):
    name: str = Field(min_length=1)
    items: list[SectionItem] = Field(default_factory=list)


class FindingCreate(BaseModel):
    title: str = Field(min_length=1)
    severity: FindingSeverity
    room: str | None = None
    location: str | None = None
    note: str | None = None
    photo_url: str | None = None


class FindingUpdate(BaseModel):
    status: FindingStatus | None = None
    assignee_id: UUID | None = None
    note: str | None = None


class AuditOut(BaseModel):
    id: UUID
    company_id: UUID
    site_id: UUID
    status: AuditStatus
    score: int | None
    requested_by: UUID | None
    conducted_by: UUID | None
    scheduled_for: str | None
    requested_at: datetime
    conducted_at: datetime | None
    created_at: datetime


class SectionOut(BaseModel):
    id: UUID
    audit_id: UUID
    name: str
    position: int
    score: int | None
    pass_count: int
    obs_count: int
    fail_count: int
    items: list[dict]


class FindingOut(BaseModel):
    id: UUID
    audit_id: UUID
    company_id: UUID
    site_id: UUID
    title: str
    severity: FindingSeverity
    room: str | None
    location: str | None
    status: FindingStatus
    assignee_id: UUID | None
    note: str | None
    photo_url: str | None
    created_at: datetime


class AuditDetailOut(AuditOut):
    sections: list[SectionOut]
    findings: list[FindingOut]
