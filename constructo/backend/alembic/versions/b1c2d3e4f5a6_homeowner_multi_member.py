"""Homeowner multi-member model (proposal A): 5 columns + 2 FKs + index

Adds owner-minted multi-member household management to ``homeowner_members``:
who invited whom, an owner-set display name, per-member design participation
(boolean + optional single-room scope), and an invite timestamp. All columns
are nullable/defaulted so existing contractor-minted rows are backward-safe.

No new table, no enum changes, no data backfill.

Revision ID: b1c2d3e4f5a6
Revises: aa0a6c40ad86
Create Date: 2026-06-01 00:00:02.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "aa0a6c40ad86"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "homeowner_members",
        sa.Column("invited_by_member_id", pg.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "homeowner_members",
        sa.Column("display_name", sa.String(), nullable=True),
    )
    op.add_column(
        "homeowner_members",
        sa.Column(
            "can_design",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "homeowner_members",
        sa.Column("design_space_id", pg.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "homeowner_members",
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_hm_invited_by",
        "homeowner_members",
        "homeowner_members",
        ["invited_by_member_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_hm_design_space",
        "homeowner_members",
        "spaces",
        ["design_space_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # Cheap per-site cap count (active + invited rows on a site).
    op.create_index(
        "ix_hm_site_status", "homeowner_members", ["site_id", "status"]
    )


def downgrade() -> None:
    op.drop_index("ix_hm_site_status", table_name="homeowner_members")
    op.drop_constraint("fk_hm_design_space", "homeowner_members", type_="foreignkey")
    op.drop_constraint("fk_hm_invited_by", "homeowner_members", type_="foreignkey")
    op.drop_column("homeowner_members", "invited_at")
    op.drop_column("homeowner_members", "design_space_id")
    op.drop_column("homeowner_members", "can_design")
    op.drop_column("homeowner_members", "display_name")
    op.drop_column("homeowner_members", "invited_by_member_id")
