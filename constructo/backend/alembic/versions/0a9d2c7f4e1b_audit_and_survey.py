"""Audit + Survey (SiteSync) packages — Labs.

Adds the AI-assisted site quality audit tables (audits, audit_sections,
audit_findings) and the SiteSync first-visit intake table (surveys). All numeric
scores are computed deterministically in app code; these tables only persist
state. Additive only.

Revision ID: 0a9d2c7f4e1b
Revises: c9e4f1a82b6d
Create Date: 2026-06-13 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0a9d2c7f4e1b"
down_revision: str | None = "7c55e0bf1599"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ---- audits ------------------------------------------------------------
    op.create_table(
        "audits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                "requested", "in_progress", "completed", name="audit_status"
            ),
            server_default="requested",
            nullable=False,
        ),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column(
            "requested_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "conducted_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("scheduled_for", sa.String(), nullable=True),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("conducted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ---- audit_sections ----------------------------------------------------
    op.create_table(
        "audit_sections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "audit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("audits.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("pass_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("obs_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("fail_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("items", postgresql.JSONB(), nullable=False),
    )

    # ---- audit_findings ----------------------------------------------------
    op.create_table(
        "audit_findings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "audit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("audits.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column(
            "severity",
            postgresql.ENUM("critical", "major", "minor", name="finding_severity"),
            nullable=False,
        ),
        sa.Column("room", sa.String(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM("open", "assigned", "resolved", name="finding_status"),
            server_default="open",
            nullable=False,
        ),
        sa.Column(
            "assignee_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("photo_url", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ---- surveys -----------------------------------------------------------
    op.create_table(
        "surveys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sites.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("code", sa.String(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM("draft", "submitted", "onboarded", name="survey_status"),
            server_default="draft",
            nullable=False,
        ),
        sa.Column("risk_score", sa.Integer(), nullable=True),
        sa.Column("filled_pct", sa.Integer(), server_default="0", nullable=False),
        sa.Column("photo_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("area", sa.String(), nullable=True),
        sa.Column("client_name", sa.String(), nullable=True),
        sa.Column(
            "engineer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("architect_name", sa.String(), nullable=True),
        sa.Column("project_type", sa.String(), nullable=True),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("gps", sa.String(), nullable=True),
        sa.Column("plot", postgresql.JSONB(), nullable=False),
        sa.Column("approvals", postgresql.JSONB(), nullable=False),
        sa.Column("approval_status", sa.String(), nullable=True),
        sa.Column("conditions", postgresql.JSONB(), nullable=False),
        sa.Column("risks", postgresql.JSONB(), nullable=False),
        sa.Column("requirement", sa.Text(), nullable=True),
        sa.Column("ai_analysis", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("surveys")
    op.drop_table("audit_findings")
    op.drop_table("audit_sections")
    op.drop_table("audits")
    postgresql.ENUM(name="survey_status").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="finding_status").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="finding_severity").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="audit_status").drop(op.get_bind(), checkfirst=True)
