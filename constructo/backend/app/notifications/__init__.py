"""Phase B notifications — exceptions-only, per-role routing + in-app bell feed.

No new migrations are allowed in Phase B, so notifications are NOT a new table:
they are *derived* from the ``decisions`` ledger (the single source of truth).
Each open decision that needs a role's attention surfaces as one bell-feed item,
routed to the role that owns that decision kind. Read-state and anti-spam nudge
bookkeeping live in an in-process store (see :mod:`app.notifications.store`),
which is acceptable for the bell feed and keeps the ledger as the only durable
record.
"""
