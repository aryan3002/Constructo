"""Survey package — SiteSync first-visit intake (Labs).

A first site visit captured as a structured intake with a deterministic AI risk
score; can be onboarded into a Site. The risk score and filled_pct are computed
deterministically in Python (Determinism Doctrine); the LLM may only draft the
``ai_analysis`` prose. A survey can pre-date its Site, so ``site_id`` is nullable.
"""
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SurveyStatus(StrEnum):
    draft = "draft"
    submitted = "submitted"
    onboarded = "onboarded"


class Survey(Base):
    __tablename__ = "surveys"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    # A survey can pre-date the site, so this is nullable (SET NULL on site delete).
    site_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    code: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[SurveyStatus] = mapped_column(
        SAEnum(SurveyStatus, name="survey_status"),
        nullable=False,
        server_default=SurveyStatus.draft.value,
    )
    risk_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    filled_pct: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    photo_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    area: Mapped[str | None] = mapped_column(String, nullable=True)
    client_name: Mapped[str | None] = mapped_column(String, nullable=True)
    engineer_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    architect_name: Mapped[str | None] = mapped_column(String, nullable=True)
    project_type: Mapped[str | None] = mapped_column(String, nullable=True)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    gps: Mapped[str | None] = mapped_column(String, nullable=True)
    # {no,facing,corner,actual,shape,far,coverage}
    plot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    approvals: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)  # list[str]
    approval_status: Mapped[str | None] = mapped_column(String, nullable=True)
    conditions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)  # [[label,value]]
    # list of {name, level: "Low"|"Medium"|"High", tone}
    risks: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    requirement: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
