"""Proof-Locked Approval L1 — payments.approved_by/at + evidence + reversible_until (2.5)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-06 02:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column(
            "approved_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("payments", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "payments",
        sa.Column(
            "evidence_event_ids",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            server_default="{}",
            nullable=False,
        ),
    )
    op.add_column(
        "payments", sa.Column("reversible_until", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("payments", "reversible_until")
    op.drop_column("payments", "evidence_event_ids")
    op.drop_column("payments", "approved_at")
    op.drop_column("payments", "approved_by")
