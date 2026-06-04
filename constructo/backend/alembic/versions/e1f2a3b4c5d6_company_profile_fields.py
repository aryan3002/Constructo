"""Company profile fields (W4.2)

Adds tracking-only profile columns to ``companies`` so the Setup & Administration
Company Profile form can edit more than the name:

  * ``gstin``    — GST identification number (nullable)
  * ``address``  — registered address (nullable)
  * ``timezone`` — IANA tz, NOT NULL, server_default ``Asia/Kolkata``
  * ``currency`` — ISO code,  NOT NULL, server_default ``INR``

The two NOT NULL columns carry server defaults so existing rows backfill to the
India SMB norm without a data migration.

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-06-05 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1f2a3b4c5d6"
down_revision: str | None = "d0e1f2a3b4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("gstin", sa.String(), nullable=True))
    op.add_column("companies", sa.Column("address", sa.String(), nullable=True))
    op.add_column(
        "companies",
        sa.Column(
            "timezone",
            sa.String(),
            nullable=False,
            server_default="Asia/Kolkata",
        ),
    )
    op.add_column(
        "companies",
        sa.Column(
            "currency",
            sa.String(),
            nullable=False,
            server_default="INR",
        ),
    )


def downgrade() -> None:
    op.drop_column("companies", "currency")
    op.drop_column("companies", "timezone")
    op.drop_column("companies", "address")
    op.drop_column("companies", "gstin")
