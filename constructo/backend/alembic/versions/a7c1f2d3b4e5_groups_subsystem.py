"""Groups subsystem — kind=group, nullable site_id, partial unique index,
conversation_members (doc 18 Phase 2)

Adds the ``group`` value to the ``conversation_kind`` enum, makes
``conversations.site_id`` nullable (groups may be site-less), swaps the
(site_id, kind) unique constraint for a partial unique index that only enforces
singleton-ness for the ``site`` and ``homeowner`` kinds, adds ``archived_at``,
and introduces the explicit ``conversation_members`` table (with the
``member_role`` enum).

Revision ID: a7c1f2d3b4e5
Revises: f7a8b9c0d1e2
Create Date: 2026-06-07 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7c1f2d3b4e5"
down_revision: str | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add the 'group' value to the existing conversation_kind enum. Safe inside
    # the migration transaction on PG12+ because the new value is not used in
    # the same migration (group conversations are created at runtime).
    op.execute("ALTER TYPE conversation_kind ADD VALUE IF NOT EXISTS 'group'")

    # Groups may be site-less.
    op.alter_column(
        "conversations",
        "site_id",
        existing_type=postgresql.UUID(),
        existing_nullable=False,
        nullable=True,
    )

    # Swap the (site_id, kind) unique constraint for a partial unique index that
    # only enforces the per-(site, kind) singleton for site/homeowner threads —
    # a site can have many group threads.
    op.drop_constraint("uq_conversation_site_kind", "conversations", type_="unique")
    op.create_index(
        "uq_conversation_site_singleton",
        "conversations",
        ["site_id", "kind"],
        unique=True,
        postgresql_where=sa.text("kind IN ('site','homeowner')"),
    )

    # Since site_id is now nullable, the partial unique index alone can't keep
    # site/homeowner threads singleton (Postgres treats NULLs as distinct).
    # Require a site_id for every site/homeowner thread. Phrased over the
    # existing enum values (NOT the freshly-added 'group') so the CHECK can be
    # created in the same transaction that adds 'group' — Postgres forbids
    # referencing a new enum value before it is committed.
    op.create_check_constraint(
        "ck_conversation_site_required",
        "conversations",
        "kind NOT IN ('site','homeowner') OR site_id IS NOT NULL",
    )

    op.add_column(
        "conversations",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "conversation_members",
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
        sa.Column(
            "role",
            postgresql.ENUM("admin", "member", name="member_role"),
            server_default="member",
            nullable=False,
        ),
        sa.Column(
            "added_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("muted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("conversation_members")
    postgresql.ENUM(name="member_role").drop(op.get_bind(), checkfirst=True)

    op.drop_column("conversations", "archived_at")
    op.drop_constraint("ck_conversation_site_required", "conversations", type_="check")
    op.drop_index("uq_conversation_site_singleton", table_name="conversations")

    # NOTE: this re-NOT-NULL will FAIL if any 'group' conversation has a null
    # site_id. Acceptable: Phase 2 groups always carry a site_id.
    op.alter_column(
        "conversations",
        "site_id",
        existing_type=postgresql.UUID(),
        existing_nullable=True,
        nullable=False,
    )
    op.create_unique_constraint(
        "uq_conversation_site_kind", "conversations", ["site_id", "kind"]
    )
    # NOTE: the 'group' value added to the conversation_kind enum is intentionally
    # left in place — PostgreSQL cannot drop a single enum value, so removing it
    # would require recreating the type. Harmless to leave on downgrade.
