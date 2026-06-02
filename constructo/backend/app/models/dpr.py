"""Daily Progress Report (DPR) — C4 PM Auto-DPR.

A ``dprs`` row is the auto-drafted daily progress report for one site on one
date. ``draft_dpr()`` (``app/dpr/draft.py``) assembles it from that day's
``site_events``: deterministic structured sections (labour / materials /
work-done / blockers / next) plus an LLM prose summary that degrades to a
deterministic fallback.

HARD RULE (CA1: AI proposes, the human commits): a DPR is born as a ``draft``
the PM reviews. It only becomes ``sent`` when a human explicitly hits Send —
nothing auto-sends. ``status`` therefore only ever flips ``draft → sent``, and
``sent_at`` is stamped at that moment.

``evidence_event_ids`` anchors every section back to the real ``site_events``
the draft was built from (proof on tap).
"""
from datetime import date, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DprStatus(StrEnum):
    draft = "draft"
    sent = "sent"


class Dpr(Base):
    __tablename__ = "dprs"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    report_date: Mapped[date] = mapped_column(Date, nullable=False)
    # Structured sections: work_done / labor / materials / blockers / next (+ summary).
    sections: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[DprStatus] = mapped_column(
        SAEnum(DprStatus, name="dpr_status"),
        nullable=False,
        server_default=DprStatus.draft.value,
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # JSONB list of event-id strings the draft was assembled from (proof anchor).
    evidence_event_ids: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list
    )
