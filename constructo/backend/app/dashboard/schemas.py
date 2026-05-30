"""Pydantic response/request shapes for the Owner Home dashboard endpoints."""
from __future__ import annotations

import datetime as dt
from uuid import UUID

from pydantic import BaseModel, Field


class RiskOut(BaseModel):
    site_id: str
    kind: str
    severity: str
    status: str  # kit spine: ok | warn | risk | info
    message: str
    evidence_event_ids: list[str]


class PulseTileOut(BaseModel):
    kind: str  # cash | labor | material | progress
    status: str
    value: int | None = None
    evidence_event_ids: list[str]
    facts: dict


class SiteCardOut(BaseModel):
    site_id: str
    name: str
    status: str
    expected_headcount: int | None = None
    top_risks: list[RiskOut]
    risk_overflow: int
    counts: dict
    pulse: list[PulseTileOut]


class SetupStepOut(BaseModel):
    key: str
    done: bool
    title_key: str  # i18n key, resolved client-side


class HomeOut(BaseModel):
    brief_date: dt.date
    needs_attention_count: int
    sites_total: int
    sites_needing_attention: int
    cold_start: bool
    setup_checklist: list[SetupStepOut]
    sites: list[SiteCardOut]


class DecisionCreateIn(BaseModel):
    site_id: UUID | None = None
    # Inline brief action -> decision kind is derived server-side.
    action: str = Field(description="approve | hold | assign")
    title: str
    detail: str | None = None
    assigned_to: UUID | None = None
    evidence_event_ids: list[UUID] = Field(default_factory=list)


class DecisionOut(BaseModel):
    id: UUID
    company_id: UUID
    site_id: UUID | None = None
    kind: str
    state: str
    title: str
    detail: str | None = None
    assigned_to: UUID | None = None
    evidence_event_ids: list[UUID]
    created_at: dt.datetime
