"""Company billing tracking (W4.8)

Adds ``company_billing`` (one row per company) for the Setup & Administration
Billing section — tracking-only (plan, billing_email, billing_contact, notes).
No payment rail.

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-06-05 00:00:05.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6e7f8a9b0c1"
down_revision: str | None = "c5d6e7f8a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "company_billing",
        sa.Column("id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("plan", sa.String(), nullable=True),
        sa.Column("billing_email", sa.String(), nullable=True),
        sa.Column("billing_contact", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", name="uq_company_billing_company"),
    )


def downgrade() -> None:
    op.drop_table("company_billing")
