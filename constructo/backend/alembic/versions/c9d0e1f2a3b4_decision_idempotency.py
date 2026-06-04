"""Decision idempotency — decisions.client_decision_id + per-company unique key

Adds a nullable client-supplied idempotency key (CA8) so a re-send of the same
logical decision (the owner's web chip + the mirrored WhatsApp action) converges
on ONE row instead of double-acting. Unique per company; NULLs stay distinct in
Postgres, so the bulk of keyless decisions are unaffected.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-06-04 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: str | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "decisions",
        sa.Column("client_decision_id", sa.String(), nullable=True),
    )
    op.create_unique_constraint(
        "uq_decisions_company_client_decision_id",
        "decisions",
        ["company_id", "client_decision_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_decisions_company_client_decision_id", "decisions", type_="unique"
    )
    op.drop_column("decisions", "client_decision_id")
