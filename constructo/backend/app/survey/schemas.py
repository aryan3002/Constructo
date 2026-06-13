"""Pydantic request/response schemas for the Survey (SiteSync) module.

Endpoints never return ORM objects directly — everything maps to ``SurveyOut``.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import SurveyStatus


class SurveyCreate(BaseModel):
    name: str = Field(min_length=1)
    site_id: UUID | None = None
    code: str | None = None
    area: str | None = None
    client_name: str | None = None
    engineer_id: UUID | None = None
    architect_name: str | None = None
    project_type: str | None = None
    address: str | None = None
    gps: str | None = None
    plot: dict | None = None
    approvals: list[str] | None = None
    approval_status: str | None = None
    conditions: list | None = None
    risks: list[dict] | None = None
    requirement: str | None = None
    photo_count: int | None = None


class SurveyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    code: str | None = None
    area: str | None = None
    client_name: str | None = None
    engineer_id: UUID | None = None
    architect_name: str | None = None
    project_type: str | None = None
    address: str | None = None
    gps: str | None = None
    plot: dict | None = None
    approvals: list[str] | None = None
    approval_status: str | None = None
    conditions: list | None = None
    risks: list[dict] | None = None
    requirement: str | None = None
    photo_count: int | None = None


class SurveyOut(BaseModel):
    id: UUID
    company_id: UUID
    site_id: UUID | None
    name: str
    code: str | None
    status: SurveyStatus
    risk_score: int | None
    filled_pct: int
    photo_count: int
    area: str | None
    client_name: str | None
    engineer_id: UUID | None
    architect_name: str | None
    project_type: str | None
    address: str | None
    gps: str | None
    plot: dict
    approvals: list
    approval_status: str | None
    conditions: list
    risks: list
    requirement: str | None
    ai_analysis: str | None
    created_by: UUID | None
    created_at: datetime
    submitted_at: datetime | None
