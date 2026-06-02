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
#   pm          = execution / approvals (incl. procurement — see below)
#   accountant  = billing
#   labor_contractor (mukadam) = payment holds
_KIND_TO_ROLE: dict[DecisionKind, UserRole] = {
    DecisionKind.homeowner_question: UserRole.owner,
    DecisionKind.approval: UserRole.pm,
    DecisionKind.hold_payment: UserRole.labor_contractor,
    DecisionKind.generic: UserRole.owner,
}

# Procurement is a HAT, not a seat (contractor correction #3): in the 3–15-site
# SMB there is usually no dedicated `procurement` user, so a procurement request
# (material ask -> quote -> propose-to-owner) must default-route to whoever wears
# the hat — the site's PM (or supervisor), the default hat-wearer — and NEVER to a
# non-existent procurement seat. We deliberately reuse `DecisionKind.approval`
# (already PM-routed) rather than adding a new enum value + migration. This list
# is the explicit, ordered fallback chain the feed walks: the PM, then the
# supervisor, then the owner as the backstop. The supplier/vendor portal is V2.
PROCUREMENT_HAT_ROLES: tuple[UserRole, ...] = (
    UserRole.pm,
    UserRole.supervisor,
    UserRole.owner,
)


def role_for_kind(kind: DecisionKind) -> UserRole:
    """Which role owns a decision of this kind."""
    return _KIND_TO_ROLE.get(kind, UserRole.owner)


def role_for_procurement() -> UserRole:
    """The default role a procurement request routes to.

    Correction #3: procurement is a hat (no guaranteed seat), so a procurement
    decision routes to the default hat-wearer — the PM — not a `procurement`
    seat that may not exist. ``PROCUREMENT_HAT_ROLES`` is the ordered fallback
    chain (pm -> supervisor -> owner) the feed layer can walk when no PM exists.
    """
    return PROCUREMENT_HAT_ROLES[0]


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
