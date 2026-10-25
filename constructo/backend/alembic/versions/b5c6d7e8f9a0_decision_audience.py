"""Decision audience: internal vs homeowner (T4)

Adds ``decisions.audience`` so homeowner endpoints return only decisions that
were deliberately addressed to the homeowner, instead of every pending decision
on the property (which leaked internal invoice approvals with vendor and
price). Backfill: homeowner questions and spec-routed approvals (``spec_id``
set) become ``homeowner``; everything else stays ``internal``.

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-10-25 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b5c6d7e8f9a0"
down_revision: str | None = "a4b5c6d7e8f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

decision_audience = postgresql.ENUM("internal", "homeowner", name="decision_audience")


def upgrade() -> None:
    decision_audience.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "decisions",
        sa.Column(
            "audience",
            decision_audience,
            nullable=False,
            server_default="internal",
        ),
    )
    op.execute(
        """
        UPDATE decisions SET audience = 'homeowner'
         WHERE kind = 'homeowner_question'
            OR (kind = 'approval' AND spec_id IS NOT NULL)
        """
    )


def downgrade() -> None:
    op.drop_column("decisions", "audience")
    decision_audience.drop(op.get_bind(), checkfirst=True)
