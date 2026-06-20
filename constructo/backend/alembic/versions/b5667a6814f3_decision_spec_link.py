"""decision_spec_link

Revision ID: b5667a6814f3
Revises: aa7fc0979f57
Create Date: 2026-06-14 18:30:02.656564

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b5667a6814f3"
down_revision: str | None = "aa7fc0979f57"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Idempotent: prod had spec_id applied out-of-band (via the now-deleted
    # parallel migration 599a72bc7902), so guard the column/FK so this is a safe
    # no-op where they already exist.
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("decisions")}
    if "spec_id" not in cols:
        op.add_column("decisions", sa.Column("spec_id", sa.UUID(), nullable=True))
    fks = {fk["name"] for fk in insp.get_foreign_keys("decisions")}
    if "fk_decisions_spec_id" not in fks:
        op.create_foreign_key(
            "fk_decisions_spec_id",
            "decisions",
            "specs",
            ["spec_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    fks = {fk["name"] for fk in insp.get_foreign_keys("decisions")}
    if "fk_decisions_spec_id" in fks:
        op.drop_constraint("fk_decisions_spec_id", "decisions", type_="foreignkey")
    cols = {c["name"] for c in insp.get_columns("decisions")}
    if "spec_id" in cols:
        op.drop_column("decisions", "spec_id")
