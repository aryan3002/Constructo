"""Company notification & SLA settings (W4.7)

Adds ``company_notification_settings`` (one row per company) for the Setup &
Administration Notifications section: sla_hours, escalate_overdue, daily_digest.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-06-05 00:00:04.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5d6e7f8a9b0"
down_revision: str | None = "b4c5d6e7f8a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "company_notification_settings",
        sa.Column("id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("sla_hours", sa.Integer(), nullable=False, server_default="24"),
        sa.Column(
            "escalate_overdue", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "daily_digest", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", name="uq_company_notification_settings_company"),
    )


def downgrade() -> None:
    op.drop_table("company_notification_settings")
