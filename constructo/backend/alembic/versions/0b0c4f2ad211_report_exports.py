"""report_exports

Revision ID: 0b0c4f2ad211
Revises: e6c9f3b1a528
Create Date: 2026-06-14 01:47:58.451182

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0b0c4f2ad211"
down_revision: str | None = "e6c9f3b1a528"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "report_exports",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=False),
        sa.Column("report_kind", sa.String(length=40), nullable=False),
        sa.Column("fmt", sa.String(length=10), nullable=False),
        sa.Column("scope", sa.String(length=200), nullable=False),
        sa.Column("date_range", sa.String(length=60), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_report_exports_company_id"), "report_exports", ["company_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_report_exports_company_id"), table_name="report_exports")
    op.drop_table("report_exports")
