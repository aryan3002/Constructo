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

from pydantic import BaseModel, Field, model_validator

from app.models import ComponentStatus, DrawingKind, MilestoneStatus, SpaceKind, UpdateType

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
    # Structured delay story — required together for ``type=delay``, forbidden on
    # every other type (Calm Cockpit §5/§8: red means a genuine delay, and a
    # delay must never appear without a revised date + reason + impact).
    revised_date: date | None = None
    impact_days: int | None = None
    impact_cost_delta: float | None = None  # rupees (mirrors ChangeCreateIn.cost_delta)
    reason: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _check_delay_story(self) -> PublishUpdateIn:
        delay_fields = (self.revised_date, self.impact_days, self.impact_cost_delta, self.reason)
        if self.type is UpdateType.delay:
            has_impact = self.impact_days is not None or self.impact_cost_delta is not None
            if self.revised_date is None or self.reason is None or not has_impact:
                raise ValueError(
                    "a delay update requires revised_date, reason, and at least one of "
                    "impact_days / impact_cost_delta"
                )
        elif any(f is not None for f in delay_fields):
            raise ValueError("revised_date / impact_days / impact_cost_delta / reason are only "
                             "valid on type=delay updates")
        return self


class PublishWeeklySummaryIn(BaseModel):
    site_id: UUID
    week_start: date
    text: str | None = None  # omitted → AI-drafted from this week's update titles


class PublishDrawingIn(BaseModel):
    """Publish a drawing/plan sheet into the homeowner-visible set (E2 columns).

    A new version of an existing sheet sets ``supersedes_id`` to the prior
    drawing's id (append-only versioning). Plain-language summaries are optional
    — the read side can surface the raw sheet before a plain pass exists.
    """

    site_id: UUID
    title: str = Field(min_length=1)
    version: str = Field(min_length=1)
    file_url: str = Field(min_length=1)
    kind: DrawingKind = DrawingKind.other
    change_note: str | None = None
    plain_summary_en: str | None = None
    plain_summary_hi: str | None = None
    supersedes_id: UUID | None = None


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
