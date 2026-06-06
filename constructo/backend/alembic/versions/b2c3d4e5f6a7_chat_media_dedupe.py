"""Adversarial-capture dedupe — chat_messages.media_sha256 + duplicate_of_id (1.7)

A content hash on chat attachments so a replayed challan (same bytes re-sent) is
recorded as a duplicate and never books a second event. client_msg_id can't see
this; the hash can.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-06 00:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("media_sha256", sa.String(), nullable=True))
    op.add_column(
        "chat_messages",
        sa.Column(
            "duplicate_of_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chat_messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_chat_messages_media_sha256", "chat_messages", ["media_sha256"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_media_sha256", table_name="chat_messages")
    op.drop_column("chat_messages", "duplicate_of_id")
    op.drop_column("chat_messages", "media_sha256")
