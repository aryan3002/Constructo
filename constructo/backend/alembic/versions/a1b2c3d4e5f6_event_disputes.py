"""Contested-truth — event_disputes (Phase 1.7 safety rail)

A dispute raised against a SiteEvent (committed → disputed → resolved). Resolving
with a corrected value writes a superseding SiteEvent version; the dispute trail
is the attributed receipt. Lands before money-tier tools (2.5).

Revision ID: a1b2c3d4e5f6
Revises: f8a9b0c1d2e3
Create Date: 2026-06-06 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f8a9b0c1d2e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "event_disputes",
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
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("site_events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "raised_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("raised_by_role", sa.String(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("proposed_fields", postgresql.JSONB(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM("open", "resolved", "withdrawn", name="dispute_status"),
            server_default="open",
            nullable=False,
        ),
        sa.Column(
            "resolved_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("resolved_fields", postgresql.JSONB(), nullable=True),
        sa.Column(
            "resolved_event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("site_events.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_event_disputes_site_id", "event_disputes", ["site_id"])
    op.create_index("ix_event_disputes_event_id", "event_disputes", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_event_disputes_event_id", table_name="event_disputes")
    op.drop_index("ix_event_disputes_site_id", table_name="event_disputes")
    op.drop_table("event_disputes")
    postgresql.ENUM(name="dispute_status").drop(op.get_bind(), checkfirst=True)
