"""Pure decision state machine — no I/O, fully unit-testable.

The ledger states form this graph::

    pending ─acknowledge→ acknowledged ─resolve→ resolved
       │  │                   │        └reject──→ rejected
       │  │                   └─reject──────────→ rejected
       │  └─resolve──────────────────────────────→ resolved
       │  └─reject───────────────────────────────→ rejected
       │  └─escalate─────────────────────────────→ escalated
       │
    escalated ─resolve/reject→ resolved/rejected   (an escalated item is
                                                     still actionable)
    acknowledged ─escalate→ escalated

``resolved`` and ``rejected`` are terminal. Transitions are idempotent at the
edges: asking to ``resolve`` an already-``resolved`` decision is a no-op (so the
API can be retried, and a WhatsApp reply + a dashboard tap on the same ledger
row converge instead of conflicting).
"""
from __future__ import annotations

from enum import StrEnum

from app.models import DecisionState


class DecisionAction(StrEnum):
    acknowledge = "acknowledge"
    resolve = "resolve"
    reject = "reject"
    escalate = "escalate"


# Terminal states cannot transition further (except idempotent self-requests).
TERMINAL: frozenset[DecisionState] = frozenset(
    {DecisionState.resolved, DecisionState.rejected}
)

# action -> target state.
_TARGET: dict[DecisionAction, DecisionState] = {
    DecisionAction.acknowledge: DecisionState.acknowledged,
    DecisionAction.resolve: DecisionState.resolved,
    DecisionAction.reject: DecisionState.rejected,
    DecisionAction.escalate: DecisionState.escalated,
}

# Which source states each action is legal from (before the idempotency check).
_ALLOWED_FROM: dict[DecisionAction, frozenset[DecisionState]] = {
    DecisionAction.acknowledge: frozenset({DecisionState.pending}),
    DecisionAction.resolve: frozenset(
        {DecisionState.pending, DecisionState.acknowledged, DecisionState.escalated}
    ),
    DecisionAction.reject: frozenset(
        {DecisionState.pending, DecisionState.acknowledged, DecisionState.escalated}
    ),
    DecisionAction.escalate: frozenset(
        {DecisionState.pending, DecisionState.acknowledged}
    ),
}


class InvalidTransition(Exception):
    """Raised when an action is not legal from the current state."""

    def __init__(self, current: DecisionState, action: DecisionAction):
        self.current = current
        self.action = action
        super().__init__(
            f"Cannot {action.value} a decision that is {current.value}"
        )


def is_terminal(state: DecisionState) -> bool:
    return state in TERMINAL


def can_transition(current: DecisionState, action: DecisionAction) -> bool:
    """True if ``action`` is legal from ``current`` (idempotent self-requests count)."""
    target = _TARGET[action]
    if current == target:
        return True  # idempotent
    return current in _ALLOWED_FROM[action]


def next_state(current: DecisionState, action: DecisionAction) -> DecisionState:
    """Compute the resulting state.

    Idempotent: requesting the action whose target equals the current state is a
    no-op that returns ``current``. Otherwise an illegal transition raises
    :class:`InvalidTransition`.
    """
    target = _TARGET[action]
    if current == target:
        return current
    if current not in _ALLOWED_FROM[action]:
        raise InvalidTransition(current, action)
    return target
