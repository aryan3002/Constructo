"""H6 quiet_periods (contracts-freeze: shape only, no behavior)

Revision ID: 48969bafd86c
Revises: f127c51fd73c
Create Date: 2026-06-01 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "48969bafd86c"
down_revision: str | None = "f127c51fd73c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "quiet_periods",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("site_id", sa.UUID(), nullable=False),
        sa.Column(
            "detected_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_signal_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gap_days", sa.Integer(), nullable=False),
        sa.Column("phase_reason", sa.Text(), nullable=True),
        sa.Column("reason_source", sa.String(), server_default="schedule", nullable=False),
        sa.Column("next_expected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("draft_text", sa.Text(), nullable=True),
        sa.Column("draft_text_hi", sa.Text(), nullable=True),
        sa.Column("published_text", sa.Text(), nullable=True),
        sa.Column(
            "confidence",
            sa.Numeric(precision=4, scale=3),
            server_default="1.000",
            nullable=False,
        ),
        sa.Column("update_id", sa.UUID(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "open",
                "suggested",
                "confirmed",
                "published",
                "closed",
                "dismissed",
                name="quiet_status",
            ),
            server_default="open",
            nullable=False,
        ),
        sa.Column("confirmed_by", sa.UUID(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["update_id"], ["updates.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["confirmed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    # One live window per site (the H6.2 sweep's DB-level idempotency invariant).
    op.create_index(
        "uq_quiet_open_per_site",
        "quiet_periods",
        ["site_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('open','suggested','confirmed','published')"),
    )
    op.create_index("ix_quiet_periods_site_id", "quiet_periods", ["site_id"])


def downgrade() -> None:
    op.drop_index("ix_quiet_periods_site_id", table_name="quiet_periods")
    op.drop_index("uq_quiet_open_per_site", table_name="quiet_periods")
    op.drop_table("quiet_periods")
    # Inline sa.Enum auto-creates the type on upgrade; drop_table does not remove
    # it, so drop explicitly (H0 migration pattern).
    op.execute("DROP TYPE IF EXISTS quiet_status")
