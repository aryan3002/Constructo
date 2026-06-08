"""Pydantic request/response schemas for the homeowner-facing API (H0).

Homeowner reads return ONLY curated/published data — never raw ops. Money is
returned as plain numbers (rupees); the mobile client formats lakh/crore.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import (
    ComponentStatus,
    DrawingKind,
    HomeownerRequestStatus,
    HomeownerSubRole,
    MemberStatus,
    MilestoneStatus,
    ReferenceSource,
    UpdateType,
)

# ---- onboarding / membership ----------------------------------------------


class JoinIn(BaseModel):
    join_code: str = Field(min_length=1)
    phone: str = Field(min_length=1)
    otp: str = Field(min_length=1)
    # The joining homeowner's own name, captured on the join form so Members /
    # Settings show a real name instead of a bare phone. Optional for backward
    # compatibility (older clients / API callers omit it).
    name: str | None = None


class TokenOut(BaseModel):
    token: str
    site_id: UUID
    sub_role: HomeownerSubRole


class JoinOut(TokenOut):
    """Onboarding enrichment over :class:`TokenOut`.

    Carries the friendly names the just-joined homeowner sees first: their
    property's display name and the building company's name. Both are nullable
    so a sparsely-seeded property never breaks redemption.
    """

    display_name: str | None = None
    company_name: str | None = None


class MemberCreateIn(BaseModel):
    """Contractor mints a member (and a join code) for a homeowner to redeem."""

    site_id: UUID
    sub_role: HomeownerSubRole = HomeownerSubRole.primary_owner
    phone: str | None = None
    notif_prefs: dict = Field(default_factory=dict)


class MemberPrefsIn(BaseModel):
    notif_prefs: dict


class HomeownerMemberInviteIn(BaseModel):
    """A primary/co-owner mints a household member (and a join code to redeem)."""

    site_id: UUID | None = None  # resolve_site if omitted
    sub_role: HomeownerSubRole = HomeownerSubRole.family
    phone: str | None = None
    display_name: str | None = None
    can_design: bool = False
    design_space_id: UUID | None = None  # must belong to site_id if set
    notif_prefs: dict = Field(default_factory=dict)


class HomeownerMemberManageIn(BaseModel):
    """A primary/co-owner designates role + design participation for a member.

    All fields optional — only the supplied ones are changed. ``design_space_id``
    is tri-state-ish via the model_fields_set check in the handler (omitted =
    leave as-is; explicit null = clear the room scope).
    """

    sub_role: HomeownerSubRole | None = None
    display_name: str | None = None
    can_design: bool | None = None
    design_space_id: UUID | None = None


class MemberOut(BaseModel):
    id: UUID
    site_id: UUID
    user_id: UUID | None
    sub_role: HomeownerSubRole
    notif_prefs: dict
    phone: str | None
    join_code: str
    status: MemberStatus
    created_at: datetime
    # A deep link the contractor shares; the app reads the code from it.
    invite_link: str
    # --- multi-member management (proposal A) -------------------------------
    display_name: str | None = None
    can_design: bool = False
    design_space_id: UUID | None = None
    invited_by_member_id: UUID | None = None
    invited_at: datetime | None = None


# ---- feed reads ------------------------------------------------------------


class MilestoneOut(BaseModel):
    id: UUID
    site_id: UUID
    name: str
    status: MilestoneStatus
    started_on: date | None
    expected_on: date | None
    completed_on: date | None
    order: int
    # Industry-typical (NOT project-specific) ``[min, max]`` day range for this
    # phase, matched by name — see ``milestone_reference``. ``None`` when the
    # name isn't recognized; the UI labels it "usually X–Y days" and never as a
    # per-project estimate.
    typical_duration_days: tuple[int, int] | None = None


class PhotoOut(BaseModel):
    id: UUID
    site_id: UUID
    image_url: str
    caption: str | None
    room_tag: str | None
    milestone_id: UUID | None
    is_starred: bool
    published_at: datetime
    # Honest-AI review gate (Slice V): an AI-drafted caption is returned here for
    # the CONTRACTOR to review — it is NEVER auto-written into ``caption`` (the
    # homeowner-visible field). The homeowner feed never serialises this field.
    draft_caption: str | None = None


class UpdateOut(BaseModel):
    id: UUID
    site_id: UUID
    type: UpdateType
    title: str
    body: str | None
    published_at: datetime
    # Structured delay story (Calm Cockpit §5/§8). Populated only for type=delay;
    # null on every other type. The mobile delay card renders the red treatment
    # only when revised_date + reason + an impact are all present.
    revised_date: date | None = None
    impact_days: int | None = None
    impact_cost_delta: float | None = None  # rupees; the client formats lakh/crore
    reason: str | None = None


class WeeklySummaryOut(BaseModel):
    id: UUID
    site_id: UUID
    week_start: date
    text: str
    published_at: datetime


class DrawingOut(BaseModel):
    """A published drawing/plan sheet (E2 columns). Shared by the contractor
    publish response and the homeowner read slice."""

    id: UUID
    site_id: UUID
    title: str
    version: str
    file_url: str
    kind: DrawingKind
    published_by: UUID | None
    published_at: datetime
    plain_summary_en: str | None
    plain_summary_hi: str | None
    change_note: str | None
    supersedes_id: UUID | None


class ChangeOut(BaseModel):
    id: UUID
    site_id: UUID
    description: str
    cost_delta: float | None
    schedule_delta_days: int | None
    reason: str | None
    approved_by: UUID | None
    requested_by: UUID | None = None          # who initiated the scope change
    # Cumulative cost delta up to and including this item. Defaulted so single-item
    # constructors (e.g. the publish create-change response) need not compute it;
    # the homeowner changes-log handler always populates it.
    running_total_cost: float = 0.0
    approved_by_name: str | None = None       # resolved server-side via User JOIN
    requested_by_name: str | None = None      # resolved server-side via User JOIN
    created_at: datetime


class ChangesOut(BaseModel):
    """Changes log with running totals (rupees / days)."""

    items: list[ChangeOut]
    total_cost_delta: float
    total_schedule_delta_days: int


class ComponentOut(BaseModel):
    id: UUID
    name: str
    kind: str | None
    status: ComponentStatus


class SpaceOut(BaseModel):
    id: UUID
    site_id: UUID
    parent_id: UUID | None
    name: str
    kind: str
    order: int
    components: list[ComponentOut] = Field(default_factory=list)
    # Fraction of components done (0..1), or None when a space has no components.
    progress: float | None = None


class PropertyOut(BaseModel):
    id: UUID
    site_id: UUID
    display_name: str
    type: str | None
    status: str | None
    started_on: date | None
    expected_handover_on: date | None
    spaces: list[SpaceOut] = Field(default_factory=list)


class AttentionItem(BaseModel):
    """A pending decision surfaced on the home dashboard (one at a time)."""

    id: UUID
    title: str
    detail: str | None
    kind: str
    created_at: datetime


class SpendSummary(BaseModel):
    total_change_cost_delta: float
    change_count: int


class QuietPeriodOut(BaseModel):
    """A contractor-confirmed quiet card ("nothing visible today, here's why").

    Always the calm, sourced reason — never an alarm. Only confirmed/published
    windows are ever serialised here; drafts pending contractor confirm are
    filtered out at the query layer.
    """

    id: UUID
    site_id: UUID
    status: str
    gap_days: int
    reason: str | None
    last_signal_at: datetime | None
    next_expected_at: datetime | None
    detected_at: datetime


class HomeOut(BaseModel):
    """The daily 'am I okay?' dashboard payload.

    The status card uses a TIME-BAR (started_on → expected_handover_on), not a
    percentage. Conditional sections are empty when there's nothing to show.
    """

    property: PropertyOut | None
    milestone_now: MilestoneOut | None
    milestone_next: MilestoneOut | None
    needs_attention: list[AttentionItem]
    recent_activity: list[UpdateOut]
    spend_summary: SpendSummary | None
    # The current confirmed quiet card, or null. Lets Home/Updates/Photos render
    # a calm empty state ("nothing new to see — here's why") instead of silence.
    quiet: QuietPeriodOut | None = None


# ---- design ----------------------------------------------------------------


class DesignProfileOut(BaseModel):
    id: UUID | None
    site_id: UUID
    profile: dict
    created_at: datetime | None
    updated_at: datetime | None


class DesignProfilePutIn(BaseModel):
    """Generate (or regenerate) the AI design profile from intake.

    ``profile`` lets the homeowner save a confirmed/adjusted profile directly;
    if omitted, the server AI-drafts one from current selections + references.
    """

    site_id: UUID | None = None
    profile: dict | None = None


class ReferenceCreateIn(BaseModel):
    site_id: UUID | None = None
    image_url: str = Field(min_length=1)
    room_tag: str | None = None
    source: ReferenceSource = ReferenceSource.upload


class ReferenceOut(BaseModel):
    id: UUID
    site_id: UUID
    image_url: str
    room_tag: str | None
    source: ReferenceSource
    # Who added this reference (proposal C — attribution); null for legacy rows.
    actor_member_id: UUID | None = None
    created_at: datetime


class DesignConflictOption(BaseModel):
    """One member's diverging choice inside a "decide together" conflict."""

    choice: str
    member_id: UUID | None = None
    sub_role: str
    by: str


class DesignConflictOut(BaseModel):
    """A calm conflict card: two authoritative members diverge on (item, room).

    Resolution is a HUMAN decision — the AI never picks a winner (Hard Rule 5).
    ``room`` is the space id the divergence is scoped to, or null (whole-house).
    """

    item: str
    room: UUID | None = None
    options: list[DesignConflictOption]
    resolve_roles: list[str]


class DesignConflictResolveIn(BaseModel):
    """A human picks one option to settle a conflict (no AI adjudication).

    The chosen ``(item, room, choice)`` becomes an authoritative selection by the
    resolver; the diverging selections are left intact (audit) but the resolved
    choice now wins the (item, room) group on the next draft.
    """

    item: str = Field(min_length=1)
    choice: str = Field(min_length=1)
    space_id: UUID | None = None
    site_id: UUID | None = None


class SelectionCreateIn(BaseModel):
    site_id: UUID | None = None
    space_id: UUID | None = None
    item: str = Field(min_length=1)
    choice: str = Field(min_length=1)
    status: str = "proposed"


class SelectionOut(BaseModel):
    id: UUID
    site_id: UUID
    space_id: UUID | None
    item: str
    choice: str
    status: str
    created_at: datetime


class ConsistencyCheckIn(BaseModel):
    site_id: UUID | None = None
    item: str = Field(min_length=1)
    choice: str = Field(min_length=1)


class ConsistencyCheckOut(BaseModel):
    fits: bool
    feedback: str


# ---- requests & decisions --------------------------------------------------


class RequestCreateIn(BaseModel):
    site_id: UUID | None = None
    title: str = Field(min_length=1)
    detail: str | None = None


class RequestStatusPatchIn(BaseModel):
    status: HomeownerRequestStatus


class RequestOut(BaseModel):
    id: UUID
    site_id: UUID
    raised_by: UUID | None
    title: str
    detail: str | None
    status: HomeownerRequestStatus
    sla_due_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DecisionRespondIn(BaseModel):
    action: Literal["approve", "comment", "request_change"]
    note: str | None = None


class HomeownerDecisionOut(BaseModel):
    id: UUID
    site_id: UUID | None
    kind: str
    title: str
    detail: str | None
    state: str
    created_at: datetime


class CapabilitiesOut(BaseModel):
    """What the calling member may do on a property (drives client affordances)."""

    sub_role: str
    can_approve: bool
    can_comment: bool
    can_manage_members: bool
    can_design: bool
    design_space_id: UUID | None = None
