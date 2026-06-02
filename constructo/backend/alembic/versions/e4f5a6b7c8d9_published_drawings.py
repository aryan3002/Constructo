"""Published drawings table (C3 — close field stubs)

Adds ``published_drawings`` (E2 columns) so the contractor can publish a
drawing/plan sheet and the homeowner can read it. Versions are append-only via
a self-FK ``supersedes_id`` (SET NULL so pruning an old version never orphans
its successor). FK ``site_id`` CASCADEs; ``published_by`` SET NULL.

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-06-01 00:00:05.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4f5a6b7c8d9"
down_revision: str | None = "d3e4f5a6b7c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    drawing_kind = pg.ENUM(
        "plan",
        "elevation",
        "section",
        "structural",
        "electrical",
        "plumbing",
        "other",
        name="drawing_kind",
        create_type=False,
    )
    drawing_kind.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "published_drawings",
        sa.Column("id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("site_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("version", sa.String(), nullable=False),
        sa.Column("file_url", sa.String(), nullable=False),
        sa.Column(
            "kind",
            drawing_kind,
            server_default="other",
            nullable=False,
        ),
        sa.Column("published_by", pg.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("plain_summary_en", sa.Text(), nullable=True),
        sa.Column("plain_summary_hi", sa.Text(), nullable=True),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.Column("supersedes_id", pg.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["published_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["supersedes_id"], ["published_drawings.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_published_drawings_site_id",
        "published_drawings",
        ["site_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_published_drawings_site_id", table_name="published_drawings"
    )
    op.drop_table("published_drawings")
    pg.ENUM(name="drawing_kind").drop(op.get_bind(), checkfirst=True)
