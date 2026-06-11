"""bet_metrics_weekly — kill-criteria weekly snapshot table

Revision ID: c9e4f1a82b6d
Revises: 42af68937312
Create Date: 2026-06-11 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c9e4f1a82b6d'
down_revision: str | None = '42af68937312'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'bet_metrics_weekly',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'company_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('companies.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('week_start', sa.Date, nullable=False),
        sa.Column('payload', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column(
            'computed_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.UniqueConstraint('company_id', 'week_start', name='uq_bet_metrics_company_week'),
    )
    op.create_index(
        'ix_bet_metrics_weekly_company_id',
        'bet_metrics_weekly',
        ['company_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_bet_metrics_weekly_company_id', table_name='bet_metrics_weekly')
    op.drop_table('bet_metrics_weekly')
