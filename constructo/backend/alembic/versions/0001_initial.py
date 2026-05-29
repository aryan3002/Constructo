"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-28

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


user_role = postgresql.ENUM(
    "owner",
    "pm",
    "supervisor",
    "accountant",
    "procurement",
    "labor_contractor",
    name="user_role",
    create_type=False,
)


def upgrade() -> None:
    # pgvector extension (enabled now, not yet used).
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    user_role.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "companies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("phone", name="uq_users_phone"),
    )

    op.create_table(
        "sites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "whatsapp_groups",
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
        sa.Column("external_group_id", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.UniqueConstraint(
            "external_group_id", "source", name="uq_whatsapp_group_external_source"
        ),
    )

    op.create_table(
        "raw_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("external_group_id", sa.String(), nullable=False),
        sa.Column("sender_id", sa.String(), nullable=False),
        sa.Column("sender_name", sa.String(), nullable=True),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("media_url", sa.String(), nullable=True),
        sa.Column("media_mime", sa.String(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("raw", postgresql.JSONB(), nullable=False, server_default="{}"),
    )

    op.create_table(
        "site_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("fields", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("needs_clarification", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "source_message_ids",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "supersedes_event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("site_events.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "owner_briefs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("brief_date", sa.Date(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("owner_briefs")
    op.drop_table("site_events")
    op.drop_table("raw_messages")
    op.drop_table("whatsapp_groups")
    op.drop_table("sites")
    op.drop_table("users")
    op.drop_table("companies")
    user_role.drop(op.get_bind(), checkfirst=True)
    op.execute("DROP EXTENSION IF EXISTS vector")
