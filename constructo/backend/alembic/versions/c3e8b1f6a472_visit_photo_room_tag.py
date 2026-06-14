"""visit photo room tag

Adds an optional room/area tag to homeowner-uploaded visit photos so they can be
segregated By Room (and used as structured metadata for search + AI). Additive +
nullable — no backfill, no data loss.

Revision ID: c3e8b1f6a472
Revises: a9f2c4e1b7d3
Create Date: 2026-06-14 01:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3e8b1f6a472'
down_revision: str | None = 'a9f2c4e1b7d3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "homeowner_visit_photos",
        sa.Column("room_tag", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("homeowner_visit_photos", "room_tag")
