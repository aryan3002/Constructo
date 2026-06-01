"""Approval Inbox API — the decisions ledger + SLA sweep trigger.

All routes are auth'd and company-scoped (a decision is only visible/actionable
within the caller's company, and only on sites the caller can see). Actions go
through the pure state machine and are idempotent so the same ledger row can be
settled from here or from a WhatsApp reply (one ledger).
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.approvals.schemas import (
    BatchActionIn,
    BatchResultOut,
    DecisionAssignIn,
    DecisionCreate,
    DecisionOut,
    DecisionResolveIn,
    DecisionRespondIn,
    SlaSweepOut,
)
from app.approvals.service import apply_action, assign
from app.approvals.sla import run_sla_sweep
from app.approvals.state_machine import DecisionAction
from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.common.pagination import DEFAULT_LIMIT, MAX_LIMIT, Page, decode_cursor, encode_cursor
from app.db import get_session
from app.models import Decision, DecisionState, User
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/approvals", tags=["approvals"])


def _parse_limit(limit: int) -> int:
    if limit <= 0:
        return DEFAULT_LIMIT
    return min(limit, MAX_LIMIT)


def _decode(cursor: str | None) -> str | None:
    try:
        return decode_cursor(cursor)
    except ValueError as exc:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor") from exc


def _out(d: Decision) -> DecisionOut:
    return DecisionOut(
        id=d.id,
        company_id=d.company_id,
        site_id=d.site_id,
        kind=d.kind,
        title=d.title,
        detail=d.detail,
        raised_by=d.raised_by,
        assigned_to=d.assigned_to,
        state=d.state,
        sla_due_at=d.sla_due_at,
        resolved_at=d.resolved_at,
        resolution_note=d.resolution_note,
        evidence_event_ids=list(d.evidence_event_ids or []),
        created_at=d.created_at,
        updated_at=d.updated_at,
    )


async def _get_in_scope(
    session: AsyncSession, user: User, decision_id: UUID
) -> Decision:
    """Fetch a decision the caller is allowed to see, or raise 404/403."""
    decision = await session.get(Decision, decision_id)
    if decision is None or decision.company_id != user.company_id:
        raise AppError(404, "not_found", "Decision not found")
    if decision.site_id is not None:
        visible = await effective_visible_site_ids(session, user)
        if decision.site_id not in visible:
            raise AppError(403, "forbidden", "Decision not in scope")
    return decision


# ---- list / create ---------------------------------------------------------


@router.get("", response_model=Page[DecisionOut])
async def list_decisions(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    state: DecisionState | None = Query(None),
    for_: str | None = Query(None, alias="for"),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[DecisionOut]:
    """The approval inbox: company-scoped decisions, newest first.

    Optionally filter by ``state`` (the inbox defaults to the open ones).
    Company-wide sites and the caller's assigned sites are both included;
    decisions with no site are always visible within the company.

    ``for=me`` narrows to the asks **assigned to the caller** — the supervisor/PM
    "things pointed at me" feed (C3). The mobile ``/asks?for=me`` read maps here.
    """
    visible = set(await effective_visible_site_ids(session, user))
    page_size = _parse_limit(limit)
    after = _decode(cursor)

    stmt = select(Decision).where(Decision.company_id == user.company_id)
    if state is not None:
        stmt = stmt.where(Decision.state == state)
    if for_ == "me":
        stmt = stmt.where(Decision.assigned_to == user.id)
    # Order by created_at then id for a stable cursor.
    stmt = stmt.order_by(Decision.created_at.desc(), Decision.id)

    rows = list((await session.execute(stmt)).scalars().all())
    # Site scoping: site-less decisions always visible; site-bound only if visible.
    rows = [r for r in rows if r.site_id is None or r.site_id in visible]

    # Cursor on id (opaque) — simple offset-free slice over the filtered list.
    if after is not None:
        try:
            start = next(i for i, r in enumerate(rows) if str(r.id) == after) + 1
        except StopIteration:
            start = len(rows)
        rows = rows[start:]

    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))

    return Page[DecisionOut](items=[_out(r) for r in rows], next_cursor=next_cursor)


@router.post("", response_model=DecisionOut, status_code=201)
async def create_decision(
    body: DecisionCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DecisionOut:
    """Raise a decision into the ledger (approval, homeowner question, hold…)."""
    if body.site_id is not None:
        visible = await effective_visible_site_ids(session, user)
        if body.site_id not in visible:
            raise AppError(403, "forbidden", "Site not in scope")

    decision = Decision(
        company_id=user.company_id,
        site_id=body.site_id,
        kind=body.kind,
        title=body.title,
        detail=body.detail,
        raised_by=body.raised_by,
        assigned_to=body.assigned_to,
        sla_due_at=body.sla_due_at,
        evidence_event_ids=body.evidence_event_ids,
    )
    session.add(decision)
    await session.commit()
    await session.refresh(decision)
    return _out(decision)


@router.get("/{decision_id}", response_model=DecisionOut)
async def get_decision(
    decision_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DecisionOut:
    return _out(await _get_in_scope(session, user, decision_id))


# ---- single-item actions ---------------------------------------------------


async def _action(
    decision_id: UUID,
    action: DecisionAction,
    note: str | None,
    user: User,
    session: AsyncSession,
) -> DecisionOut:
    decision = await _get_in_scope(session, user, decision_id)
    updated = await apply_action(session, decision, action, note=note)
    return _out(updated)


@router.post("/{decision_id}/acknowledge", response_model=DecisionOut)
async def acknowledge_decision(
    decision_id: UUID,
    body: DecisionResolveIn | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DecisionOut:
    return await _action(
        decision_id, DecisionAction.acknowledge, (body or DecisionResolveIn()).note, user, session
    )


@router.post("/{decision_id}/approve", response_model=DecisionOut)
async def approve_decision(
    decision_id: UUID,
    body: DecisionResolveIn | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DecisionOut:
    """Approve == resolve the decision (idempotent)."""
    return await _action(
        decision_id, DecisionAction.resolve, (body or DecisionResolveIn()).note, user, session
    )


@router.post("/{decision_id}/reject", response_model=DecisionOut)
async def reject_decision(
    decision_id: UUID,
    body: DecisionResolveIn | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DecisionOut:
    return await _action(
        decision_id, DecisionAction.reject, (body or DecisionResolveIn()).note, user, session
    )


# Contractor/assignee respond verbs → state-machine actions. ``confirm`` is the
# field "yes, done/acknowledged" affordance and resolves the ask (idempotent).
_RESPOND_ACTION: dict[str, DecisionAction] = {
    "confirm": DecisionAction.resolve,
    "acknowledge": DecisionAction.acknowledge,
    "reject": DecisionAction.reject,
}


@router.post("/{decision_id}/respond", response_model=DecisionOut)
async def respond_to_decision(
    decision_id: UUID,
    body: DecisionRespondIn | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DecisionOut:
    """Contractor-side respond to an ask/decision (C3 — stops the outbox 404).

    Mirrors the homeowner ``respond_to_decision`` pattern for the assignee side:
    a supervisor/PM answers a Decision through the EXISTING idempotent
    ``apply_action``. Scoped to decisions the caller can see (company + visible
    sites); a Decision assigned to someone else but on a visible site is still
    answerable (a supervisor confirming on behalf of the field), matching the
    inbox's existing site-scoped action model. The state machine rejects illegal
    transitions (409) and is idempotent so the offline outbox can replay safely.
    """
    body = body or DecisionRespondIn()
    decision = await _get_in_scope(session, user, decision_id)
    action = _RESPOND_ACTION[body.action]
    updated = await apply_action(session, decision, action, note=body.note)
    return _out(updated)


@router.post("/{decision_id}/assign", response_model=DecisionOut)
async def assign_decision(
    decision_id: UUID,
    body: DecisionAssignIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DecisionOut:
    decision = await _get_in_scope(session, user, decision_id)
    target = await session.get(User, body.assigned_to)
    if target is None or target.company_id != user.company_id:
        raise AppError(404, "not_found", "Assignee not found")
    return _out(await assign(session, decision, body.assigned_to))


# ---- batch actions ---------------------------------------------------------


@router.post("/batch/{action}", response_model=BatchResultOut)
async def batch_action(
    action: DecisionAction,
    body: BatchActionIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BatchResultOut:
    """Apply one action to many decisions (inbox multi-select).

    Each item is validated/scoped independently; out-of-scope or illegally
    transitioning ids are reported under ``skipped`` rather than failing the
    whole batch.
    """
    updated: list[UUID] = []
    skipped: list[UUID] = []
    for decision_id in body.ids:
        decision = await session.get(Decision, decision_id)
        if decision is None or decision.company_id != user.company_id:
            skipped.append(decision_id)
            continue
        if decision.site_id is not None:
            visible = await effective_visible_site_ids(session, user)
            if decision.site_id not in visible:
                skipped.append(decision_id)
                continue
        try:
            await apply_action(session, decision, action, note=body.note)
            updated.append(decision_id)
        except AppError:
            skipped.append(decision_id)
    return BatchResultOut(updated=updated, skipped=skipped)


# ---- SLA sweep trigger -----------------------------------------------------


@router.post("/sla/sweep", response_model=SlaSweepOut)
async def trigger_sla_sweep(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SlaSweepOut:
    """Run the SLA sweep for the caller's company.

    Escalates open, past-due homeowner questions (and any SLA-bearing decision)
    and raises one anti-spam nudge each. Exposes the same callable the scheduler
    would invoke; the scheduler itself is intentionally not wired here.
    """
    escalated = await run_sla_sweep(session, company_id=user.company_id)
    return SlaSweepOut(escalated=escalated)
