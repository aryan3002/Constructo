"""homeowner notifications (in-app inbox/bell feed)

Creates ``homeowner_notifications``: one row per site event (created alongside
the push), shown to every member. Per-member read state is a ``last_seen_at`` in
the member's notif_prefs (no per-row join). Additive — no data loss.

Revision ID: e6c9f3b1a528
Revises: d5b7e2a93f18
Create Date: 2026-06-14 03:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e6c9f3b1a528'
down_revision: str | None = 'd5b7e2a93f18'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "homeowner_notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_homeowner_notifications_site_created",
        "homeowner_notifications",
        ["site_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_homeowner_notifications_site_created", table_name="homeowner_notifications"
    )
    op.drop_table("homeowner_notifications")
