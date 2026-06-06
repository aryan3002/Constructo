"""In-app chat foundation — conversations, chat_messages, conversation_reads

Phase 1.0 of the AI-native chat. The thread is "capture with a conversation
around it": chat_messages.raw_message_id bridges each message into the existing
extraction pipeline. Ordering authority is the per-conversation seq (assigned
under a row lock via conversations.last_seq); client_msg_id makes sends
idempotent for an offline outbox.

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-06-05 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "d6e7f8a9b0c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # postgresql.ENUM creates each type once as part of the table that uses it
    # (each enum is used in exactly one table here).
    op.create_table(
        "conversations",
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
            "kind",
            postgresql.ENUM("homeowner", "site", name="conversation_kind"),
            nullable=False,
        ),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("last_seq", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("site_id", "kind", name="uq_conversation_site_kind"),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sender_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "sender_side",
            postgresql.ENUM("homeowner", "contractor", name="message_side"),
            nullable=False,
        ),
        sa.Column("client_msg_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("seq", sa.BigInteger(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column(
            "reply_to_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chat_messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("raw_message_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("attachment_key", sa.String(), nullable=True),
        sa.Column("attachment_mime", sa.String(), nullable=True),
        sa.Column("media_type", sa.String(), server_default="text", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "conversation_id", "client_msg_id", name="uq_chat_message_client_id"
        ),
        sa.UniqueConstraint("conversation_id", "seq", name="uq_chat_message_seq"),
    )
    op.create_index(
        "ix_chat_messages_conversation_id", "chat_messages", ["conversation_id"]
    )

    op.create_table(
        "conversation_reads",
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("last_read_seq", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("conversation_reads")
    op.drop_index("ix_chat_messages_conversation_id", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_table("conversations")
    postgresql.ENUM(name="message_side").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="conversation_kind").drop(op.get_bind(), checkfirst=True)
