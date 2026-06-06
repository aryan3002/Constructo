"""Vendor confirm-loop — vendor_confirmations (Phase 3.8)

No-install two-party-verified GRN: the contractor generates a token link, the
vendor confirms/disputes the quantity with no app install.

Revision ID: f7a8b9c0d1e2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-06 04:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f7a8b9c0d1e2"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vendor_confirmations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("site_events.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("vendor_name", sa.String(), nullable=False),
        sa.Column("material", sa.String(), nullable=True),
        sa.Column("claimed_qty", sa.Numeric(14, 2), nullable=True),
        sa.Column("claimed_unit", sa.String(), nullable=True),
        sa.Column("delivered_on", sa.Date(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending", "confirmed", "disputed", name="vendor_confirm_status"
            ),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("response_qty", sa.Numeric(14, 2), nullable=True),
        sa.Column("response_note", sa.Text(), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_vendor_confirmations_token", "vendor_confirmations", ["token"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_vendor_confirmations_token", table_name="vendor_confirmations")
    op.drop_table("vendor_confirmations")
    postgresql.ENUM(name="vendor_confirm_status").drop(op.get_bind(), checkfirst=True)
