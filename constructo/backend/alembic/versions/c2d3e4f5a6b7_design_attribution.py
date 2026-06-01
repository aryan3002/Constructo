"""Design attribution (proposal C): actor_member_id on selections + references

Attributes every design write to the member who made it, the foundation for
multi-member aggregation. ``design_fingerprint.py`` reads these FKs to weight and
group each member's contributions and to surface (item, room) conflicts.

Both columns are nullable with an ``ON DELETE SET NULL`` FK to
``homeowner_members`` — existing rows stay valid (the reducer treats NULL as the
household/primary, never as a phantom conflicting member), and authored content
survives a member leaving the household. No enum changes, no data backfill.

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-06-01 00:00:03.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c2d3e4f5a6b7"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "design_selections",
        sa.Column("actor_member_id", pg.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "design_references",
        sa.Column("actor_member_id", pg.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_ds_actor_member",
        "design_selections",
        "homeowner_members",
        ["actor_member_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_dr_actor_member",
        "design_references",
        "homeowner_members",
        ["actor_member_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_dr_actor_member", "design_references", type_="foreignkey")
    op.drop_constraint("fk_ds_actor_member", "design_selections", type_="foreignkey")
    op.drop_column("design_references", "actor_member_id")
    op.drop_column("design_selections", "actor_member_id")
