"""Structured delay fields on updates (Calm Cockpit §5/§8)

Adds the delay story columns to ``updates``: ``revised_date`` (the new expected
date), ``impact_days`` (schedule slip), ``impact_cost_delta`` (rupee impact,
mirrors ``changes.cost_delta``), and ``reason`` (plain-language why). All are
nullable — only ``type=delay`` rows populate them and the publish API enforces
that a new delay carries revised_date + reason + at least one impact. Existing
rows (and the other five update types) stay backward-safe.

No enum changes, no data backfill.

Revision ID: b5d6e7f8a9c0
Revises: a7c1f2d3b4e5
Create Date: 2026-06-08 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b5d6e7f8a9c0"
down_revision: str | None = "a7c1f2d3b4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("updates", sa.Column("revised_date", sa.Date(), nullable=True))
    op.add_column("updates", sa.Column("impact_days", sa.Integer(), nullable=True))
    op.add_column("updates", sa.Column("impact_cost_delta", sa.Numeric(14, 2), nullable=True))
    op.add_column("updates", sa.Column("reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("updates", "reason")
    op.drop_column("updates", "impact_cost_delta")
    op.drop_column("updates", "impact_days")
    op.drop_column("updates", "revised_date")
