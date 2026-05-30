"""Pydantic schemas for the contractor-side publisher (H0).

The publisher curates what the homeowner sees: photos, updates, the weekly
summary, the property skeleton, milestones, and the changes log. AI fields
(photo caption, weekly summary) are *drafted* when omitted and otherwise taken
verbatim from the contractor's edit — never auto-published without a human in
the loop.
"""
from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import ComponentStatus, MilestoneStatus, SpaceKind, UpdateType

# ---- publish to the feed ---------------------------------------------------


class PublishPhotoIn(BaseModel):
    site_id: UUID
    image_url: str = Field(min_length=1)
    source_event_id: UUID | None = None
    caption: str | None = None  # omitted → AI-drafted (contractor edits before publish)
    room_tag: str | None = None
    milestone_id: UUID | None = None
    is_starred: bool = False
    # Optional context for the AI caption draft when caption is omitted.
    event_summary: str | None = None


class PublishUpdateIn(BaseModel):
    site_id: UUID
    type: UpdateType
    title: str = Field(min_length=1)
    body: str | None = None


class PublishWeeklySummaryIn(BaseModel):
    site_id: UUID
    week_start: date
    text: str | None = None  # omitted → AI-drafted from this week's update titles


# ---- property skeleton -----------------------------------------------------


class PropertyCreateIn(BaseModel):
    site_id: UUID
    display_name: str = Field(min_length=1)
    type: str | None = None
    status: str | None = None
    started_on: date | None = None
    expected_handover_on: date | None = None


class PropertyUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, min_length=1)
    type: str | None = None
    status: str | None = None
    started_on: date | None = None
    expected_handover_on: date | None = None


class SpaceCreateIn(BaseModel):
    site_id: UUID
    name: str = Field(min_length=1)
    kind: SpaceKind
    parent_id: UUID | None = None
    order: int = 0


class SpaceUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    kind: SpaceKind | None = None
    parent_id: UUID | None = None
    order: int | None = None


class ComponentCreateIn(BaseModel):
    space_id: UUID
    name: str = Field(min_length=1)
    kind: str | None = None
    status: ComponentStatus = ComponentStatus.not_started


class ComponentUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    kind: str | None = None
    status: ComponentStatus | None = None


# ---- milestones ------------------------------------------------------------


class MilestoneCreateIn(BaseModel):
    site_id: UUID
    name: str = Field(min_length=1)
    status: MilestoneStatus = MilestoneStatus.upcoming
    started_on: date | None = None
    expected_on: date | None = None
    completed_on: date | None = None
    order: int = 0


class MilestoneUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    status: MilestoneStatus | None = None
    started_on: date | None = None
    expected_on: date | None = None
    completed_on: date | None = None
    order: int | None = None


# ---- changes ---------------------------------------------------------------


class ChangeCreateIn(BaseModel):
    site_id: UUID
    description: str = Field(min_length=1)
    cost_delta: float | None = None
    schedule_delta_days: int | None = None
    reason: str | None = None
