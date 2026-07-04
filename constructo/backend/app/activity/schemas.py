"""Pydantic response shapes for GET /api/v1/activity.

These mirror the shared ActivityItem contract exactly and are used as the
router's ``response_model`` so FastAPI serializes/validates the aggregator's
plain dicts.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

ActivityKind = Literal[
    "photo_shared",
    "update_posted",
    "milestone_reached",
    "weekly_summary",
    "scope_change",
    "homeowner_request",
    "decision_made",
    "site_health_flag",
]
LinkType = Literal[
    "feed_photo", "update", "milestone", "request", "decision", "finding"
]
Severity = Literal["info", "success", "warning"]


class ActivityLinkOut(BaseModel):
    type: LinkType
    id: str
    # Optional scroll target for feed_photo items — the source chat message id, so
    # the web deep-link can open the thread AND scroll to the photo. None for
    # direct uploads / non-photo links.
    scroll_message_id: str | None = None


class ActivityItemOut(BaseModel):
    id: str
    kind: ActivityKind
    site_id: str
    site_name: str
    title: str
    subtitle: str | None = None
    occurred_at: str  # iso8601
    actor: str | None = None
    link: ActivityLinkOut
    severity: Severity


class ActivitySummaryOut(BaseModel):
    updates_today: int
    needs_decision_count: int
    sites_total: int


class ActivityPageOut(BaseModel):
    items: list[ActivityItemOut]
    summary: ActivitySummaryOut
    next_cursor: str | None = None
