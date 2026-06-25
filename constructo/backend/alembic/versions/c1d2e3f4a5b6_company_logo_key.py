"""company logo_key

Revision ID: c1d2e3f4a5b6
Revises: b5667a6814f3
Create Date: 2026-06-25
"""
import sqlalchemy as sa

from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "b5667a6814f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("companies")}
    if "logo_key" not in cols:
        op.add_column("companies", sa.Column("logo_key", sa.String(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("companies")}
    if "logo_key" in cols:
        op.drop_column("companies", "logo_key")
