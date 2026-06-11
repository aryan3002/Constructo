"""chat reliability spine — delivered cursor, sender_kind/meta, raw status + provider dedupe

Revision ID: 42af68937312
Revises: d4dd51b05c1a
Create Date: 2026-06-10 22:40:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '42af68937312'
down_revision: str | None = 'd4dd51b05c1a'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    sender_kind = sa.Enum("user", "nivaan", "system", name="sender_kind")
    sender_kind.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "chat_messages",
        sa.Column("sender_kind", sender_kind, nullable=False, server_default="user"),
    )
    op.add_column(
        "chat_messages",
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "conversation_reads",
        sa.Column("last_delivered_seq", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.add_column(
        "raw_messages",
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
    )
    op.add_column(
        "raw_messages",
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("raw_messages", sa.Column("last_error", sa.Text(), nullable=True))
    op.add_column("raw_messages", sa.Column("provider_message_id", sa.String(), nullable=True))
    op.create_index(
        "uq_raw_provider_message",
        "raw_messages",
        ["source", "provider_message_id"],
        unique=True,
        postgresql_where=sa.text("provider_message_id IS NOT NULL"),
    )
    # Pre-existing rows were already processed — don't flag them pending.
    op.execute("UPDATE raw_messages SET status = 'done'")


def downgrade() -> None:
    op.drop_index("uq_raw_provider_message", table_name="raw_messages")
    op.drop_column("raw_messages", "provider_message_id")
    op.drop_column("raw_messages", "last_error")
    op.drop_column("raw_messages", "attempts")
    op.drop_column("raw_messages", "status")
    op.drop_column("conversation_reads", "last_delivered_seq")
    op.drop_column("chat_messages", "meta")
    op.drop_column("chat_messages", "sender_kind")
    sa.Enum(name="sender_kind").drop(op.get_bind(), checkfirst=True)
