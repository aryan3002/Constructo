"""Shared read helpers for ``SiteEventModel``.

``latest_event_clause()`` is the single source of truth for "latest-version-wins"
filtering. Every read surface that aggregates events (owner brief, dashboard,
search, reconcile) applies it so that an **edited or promoted** event — which
writes a NEW version row whose ``supersedes_event_id`` points at the old one —
never double-counts. It is a no-op until supersession edges exist (today no flow
creates them; Phase 1's reply-to-card edits and promote-to-card will), so wiring
it in now means those features land without a read-side double-counting bug.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.sql.elements import ColumnElement

from app.models import SiteEventModel


def latest_event_clause() -> ColumnElement[bool]:
    """A WHERE clause selecting only the latest version of each event.

    Excludes any event whose ``id`` is referenced by another event's
    ``supersedes_event_id`` (i.e. it has been superseded by a newer version).
    Uncorrelated subquery; ``supersedes_event_id IS NOT NULL`` is filtered so the
    ``NOT IN`` set never contains NULLs (which would wrongly exclude everything).
    """
    superseded_ids = select(SiteEventModel.supersedes_event_id).where(
        SiteEventModel.supersedes_event_id.is_not(None)
    )
    return SiteEventModel.id.not_in(superseded_ids)
