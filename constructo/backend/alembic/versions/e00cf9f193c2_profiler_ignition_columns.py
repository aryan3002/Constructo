"""profiler ignition columns

Revision ID: e00cf9f193c2
Revises: f9b3c1d2e4a5
Create Date: 2026-07-05 18:25:14.436915

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e00cf9f193c2'
down_revision: str | None = 'f9b3c1d2e4a5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'profiler_areas',
        sa.Column(
            'last_proposal_ranked_count', sa.Integer(), server_default='0', nullable=False
        ),
    )
    op.add_column(
        'profiler_references',
        sa.Column('extraction_status', sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('profiler_references', 'extraction_status')
    op.drop_column('profiler_areas', 'last_proposal_ranked_count')
