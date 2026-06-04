"""Site financials — site_financials table (W2.6 financial tracking)

Per-site owner-maintained contract figures (quotation + billed) so the web
Financial-Tracking view can show Quotation -> Billed -> Received -> Outstanding.
Received/Outstanding are computed at read time from the payments ledger; only
quotation/billed are stored. One row per site.

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-06-05 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d0e1f2a3b4c5"
down_revision: str | None = "c9d0e1f2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "site_financials",
        sa.Column("id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("site_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("quotation_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("billed_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("currency", sa.String(), server_default="INR", nullable=False),
        sa.Column("updated_by", pg.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("site_id", name="uq_site_financials_site_id"),
    )


def downgrade() -> None:
    op.drop_table("site_financials")
