"""photo comments (threaded conversation on a published photo)

Creates ``photo_comments``: a homeowner comment thread on a published feed photo.
Author name/role are snapshotted on the row. Additive (new table) — no data loss.

Revision ID: d5b7e2a93f18
Revises: c3e8b1f6a472
Create Date: 2026-06-14 02:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd5b7e2a93f18'
down_revision: str | None = 'c3e8b1f6a472'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "photo_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "photo_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("published_photos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("homeowner_members.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("author_name", sa.String(), nullable=True),
        sa.Column("author_role", sa.String(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_photo_comments_photo_id", "photo_comments", ["photo_id"])


def downgrade() -> None:
    op.drop_index("ix_photo_comments_photo_id", table_name="photo_comments")
    op.drop_table("photo_comments")
