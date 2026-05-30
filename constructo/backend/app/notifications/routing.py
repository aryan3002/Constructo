"""Pure per-role routing + severity logic for the exceptions-only feed.

Founder feedback baked in:
  * decisions of kind ``homeowner_question`` route to the site owner (the
    ``assigned_to`` on the decision, who is the owner user).
  * other kinds route to the role that owns that slice of the business.

Routing is by ROLE; the feed layer then fans a role out to the concrete users
holding that role. Everything here is pure so it is trivially unit-testable.
"""
from __future__ import annotations

from app.models import DecisionKind, DecisionState, UserRole

# kind -> the role responsible for acting on it.
#   owner       = risk / homeowner questions
#   pm          = execution / approvals
#   accountant  = billing
#   labor_contractor (mukadam) = payment holds
_KIND_TO_ROLE: dict[DecisionKind, UserRole] = {
    DecisionKind.homeowner_question: UserRole.owner,
    DecisionKind.approval: UserRole.pm,
    DecisionKind.hold_payment: UserRole.labor_contractor,
    DecisionKind.generic: UserRole.owner,
}


def role_for_kind(kind: DecisionKind) -> UserRole:
    """Which role owns a decision of this kind."""
    return _KIND_TO_ROLE.get(kind, UserRole.owner)


def severity_for(kind: DecisionKind, state: DecisionState) -> str:
    """Status-spine severity (risk/warn/info) for a decision's feed item.

    Escalated SLA breaches and payment holds are ``risk``; an open homeowner
    question or approval awaiting action is ``warn``; everything else informs.
    """
    if state == DecisionState.escalated:
        return "risk"
    if kind == DecisionKind.hold_payment:
        return "risk"
    if kind in (DecisionKind.homeowner_question, DecisionKind.approval):
        return "warn"
    return "info"


# A decision is an "exception" (worth a bell-feed item) only while it is open and
# unhandled. Once acknowledged/resolved/rejected it leaves the exceptions feed —
# "exceptions, not activity".
_OPEN_STATES: frozenset[DecisionState] = frozenset(
    {DecisionState.pending, DecisionState.escalated}
)


def is_exception(state: DecisionState) -> bool:
    return state in _OPEN_STATES
