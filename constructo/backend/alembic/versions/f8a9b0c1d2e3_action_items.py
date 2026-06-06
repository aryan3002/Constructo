"""Action Items — action_items + action_item_events (Phase 1.6)

Chat → tracked to-do with an owner, status, due date, and an append-only
lifecycle audit log. Distinct from decisions (do-a-task vs approve/comment).

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-06-05 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f8a9b0c1d2e3"
down_revision: str | None = "e7f8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "action_items",
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
            "source_message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chat_messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_by_ai", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "assignee_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            postgresql.ENUM("open", "done", "cancelled", name="action_item_status"),
            server_default="open",
            nullable=False,
        ),
        sa.Column("due_on", sa.Date(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_action_items_site_id", "action_items", ["site_id"])

    op.create_table(
        "action_item_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "action_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("action_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "kind",
            postgresql.ENUM(
                "created", "edited", "assigned", "completed", "reopened", "cancelled",
                "deleted", name="action_item_event_kind",
            ),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("actor_is_ai", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_action_item_events_action_item_id", "action_item_events", ["action_item_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_action_item_events_action_item_id", table_name="action_item_events")
    op.drop_table("action_item_events")
    op.drop_index("ix_action_items_site_id", table_name="action_items")
    op.drop_table("action_items")
    postgresql.ENUM(name="action_item_event_kind").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="action_item_status").drop(op.get_bind(), checkfirst=True)
