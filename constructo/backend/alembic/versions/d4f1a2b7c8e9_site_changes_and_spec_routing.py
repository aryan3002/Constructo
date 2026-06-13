"""Site changes + designer spec routing.

Adds the field→designer ``site_changes`` table (a site engineer reports an
as-built condition; the designer reviews / links to a revision / resolves) and
two nullable routing stamps on ``specs`` (``sent_at`` / ``released_at``) so the
designer's selection lifecycle (draft → out-for-approval → approved → released,
with rejected = "returned — revise") can be derived without disturbing the
existing owner approval flow. Additive only.

Revision ID: d4f1a2b7c8e9
Revises: 0a9d2c7f4e1b
Create Date: 2026-06-13 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4f1a2b7c8e9"
down_revision: str | None = "0a9d2c7f4e1b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ---- specs: designer routing stamps ------------------------------------
    op.add_column("specs", sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("specs", sa.Column("released_at", sa.DateTime(timezone=True), nullable=True))

    # ---- site_changes ------------------------------------------------------
    op.create_table(
        "site_changes",
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
        sa.Column("room", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("impact", sa.Text(), nullable=True),
        sa.Column("photo_url", sa.String(), nullable=True),
        sa.Column(
            "reported_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            postgresql.ENUM("new", "linked", "resolved", name="site_change_status"),
            server_default="new",
            nullable=False,
        ),
        sa.Column(
            "linked_drawing_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("published_drawings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_site_changes_site_id", "site_changes", ["site_id"])


def downgrade() -> None:
    op.drop_index("ix_site_changes_site_id", table_name="site_changes")
    op.drop_table("site_changes")
    postgresql.ENUM(name="site_change_status").drop(op.get_bind(), checkfirst=True)
    op.drop_column("specs", "released_at")
    op.drop_column("specs", "sent_at")
