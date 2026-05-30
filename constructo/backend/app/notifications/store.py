"""In-process read-state + anti-spam bookkeeping for the bell feed.

Phase B forbids new migrations, so the bell feed is derived from the
``decisions`` ledger rather than persisted. Two pieces of ephemeral state live
here:

  * ``mark_read`` / ``is_read`` — per-user read receipts for feed items.
  * ``should_nudge`` — anti-spam guard so an escalation raises *one* nudge per
    (recipient, decision) even if the SLA sweep runs repeatedly.

This is a deliberately simple module-level store: correct for a single API
process and unit-testable in isolation. A future migration could swap it for a
``notifications`` table without changing the routing or feed code.
"""
from __future__ import annotations

import threading
from uuid import UUID

_lock = threading.Lock()

# (recipient_id, feed_item_id) that have been read.
_read: set[tuple[UUID, UUID]] = set()
# (recipient_id, decision_id) already nudged about an escalation.
_nudged: set[tuple[UUID, UUID]] = set()


def reset() -> None:
    """Clear all ephemeral state (used by tests for isolation)."""
    with _lock:
        _read.clear()
        _nudged.clear()


def mark_read(recipient_id: UUID, item_id: UUID) -> None:
    with _lock:
        _read.add((recipient_id, item_id))


def is_read(recipient_id: UUID, item_id: UUID) -> bool:
    with _lock:
        return (recipient_id, item_id) in _read


def should_nudge(recipient_id: UUID, decision_id: UUID) -> bool:
    """True the first time for a (recipient, decision); False on every repeat.

    Records the nudge as a side effect so the SLA sweep can be called on a loop
    without spamming the recipient.
    """
    key = (recipient_id, decision_id)
    with _lock:
        if key in _nudged:
            return False
        _nudged.add(key)
        return True
