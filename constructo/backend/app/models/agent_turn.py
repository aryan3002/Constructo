"""Agent audit (2.1) — one row per Nivaan turn.

Every @nivaan turn is logged: the utterance, who asked, the tool the executor
ran, the terminal result kind (answer / clarify / cards — never free prose), and
the model + token cost. This is the per-feature ROI ledger and the accountability
trail; the constrained tool-loop writes exactly one row per turn.
"""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AgentResultKind(StrEnum):
    answer = "answer"  # a grounded one-line answer
    clarify = "clarify"  # one short question back
    cards = "cards"  # draft capture card(s) to confirm


class AgentTurn(Base):
    __tablename__ = "agent_turns"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    site_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="SET NULL"), nullable=True
    )
    utterance: Mapped[str] = mapped_column(Text, nullable=False)
    result_kind: Mapped[AgentResultKind] = mapped_column(
        SAEnum(AgentResultKind, name="agent_result_kind"), nullable=False
    )
    tool: Mapped[str] = mapped_column(String, nullable=False, server_default="none")
    model: Mapped[str] = mapped_column(String, nullable=False, server_default="deterministic")
    token_cost: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
