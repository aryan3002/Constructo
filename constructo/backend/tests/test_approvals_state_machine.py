"""Pure state-machine unit tests — no DB, no network."""
import pytest

from app.approvals.state_machine import (
    DecisionAction,
    InvalidTransition,
    can_transition,
    is_terminal,
    next_state,
)
from app.models import DecisionState


def test_happy_path_pending_to_resolved():
    s = DecisionState.pending
    s = next_state(s, DecisionAction.acknowledge)
    assert s == DecisionState.acknowledged
    s = next_state(s, DecisionAction.resolve)
    assert s == DecisionState.resolved


def test_pending_can_resolve_directly():
    assert next_state(DecisionState.pending, DecisionAction.resolve) == DecisionState.resolved


def test_pending_can_reject_directly():
    assert next_state(DecisionState.pending, DecisionAction.reject) == DecisionState.rejected


def test_escalated_is_still_actionable():
    assert next_state(DecisionState.escalated, DecisionAction.resolve) == DecisionState.resolved
    assert next_state(DecisionState.escalated, DecisionAction.reject) == DecisionState.rejected


@pytest.mark.parametrize("terminal", [DecisionState.resolved, DecisionState.rejected])
def test_terminal_states_are_terminal(terminal):
    assert is_terminal(terminal)
    # Cannot escalate or acknowledge a terminal decision.
    with pytest.raises(InvalidTransition):
        next_state(terminal, DecisionAction.escalate)
    with pytest.raises(InvalidTransition):
        next_state(terminal, DecisionAction.acknowledge)


def test_resolve_is_idempotent():
    # Re-resolving a resolved decision is a no-op, not an error (one ledger:
    # dashboard + WhatsApp can both settle the same row).
    assert next_state(DecisionState.resolved, DecisionAction.resolve) == DecisionState.resolved
    assert can_transition(DecisionState.resolved, DecisionAction.resolve)


def test_reject_is_idempotent():
    assert next_state(DecisionState.rejected, DecisionAction.reject) == DecisionState.rejected


def test_cannot_acknowledge_an_acknowledged_via_invalid():
    # acknowledge only legal from pending; from acknowledged it's idempotent.
    assert (
        next_state(DecisionState.acknowledged, DecisionAction.acknowledge)
        == DecisionState.acknowledged
    )


def test_cannot_escalate_resolved():
    assert not can_transition(DecisionState.resolved, DecisionAction.escalate)


def test_escalate_from_pending_and_acknowledged():
    assert next_state(DecisionState.pending, DecisionAction.escalate) == DecisionState.escalated
    assert (
        next_state(DecisionState.acknowledged, DecisionAction.escalate)
        == DecisionState.escalated
    )
