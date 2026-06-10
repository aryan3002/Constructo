"""add architect to user_role enum

Revision ID: d4dd51b05c1a
Revises: 06e1c0787f10
Create Date: 2026-06-10 15:35:02.155806

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4dd51b05c1a'
down_revision: str | None = '06e1c0787f10'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Architect = the design authority (owns the Material Spec) for interior fit-out firms.
    # ADD VALUE is allowed inside a transaction on PG12+ (we never use the value in this tx).
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'architect'")


def downgrade() -> None:
    # Postgres has no DROP VALUE for an enum type; removing 'architect' would require
    # recreating the type and rewriting every dependent column. Intentionally a no-op.
    pass
