"""site_findings (proactive intelligence)

Revision ID: d4f1a2b3c5e6
Revises: c1d2e3f4a5b6
Create Date: 2026-06-25 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4f1a2b3c5e6'
down_revision: str | None = 'c1d2e3f4a5b6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'site_findings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('site_id', sa.UUID(), nullable=False),
        sa.Column('finding_type', sa.String(), nullable=False),
        sa.Column('severity', sa.String(), nullable=False),
        sa.Column('status', sa.String(), server_default='open', nullable=False),
        sa.Column('headline', sa.Text(), nullable=False),
        sa.Column('detail', sa.Text(), server_default='', nullable=False),
        sa.Column('phase', sa.String(), nullable=True),
        sa.Column('dedupe_key', sa.String(), nullable=False),
        sa.Column(
            'evidence',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column('detected_on', sa.Date(), nullable=False),
        sa.Column('resolved_on', sa.Date(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['site_id'], ['sites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_site_findings_site_id'), 'site_findings', ['site_id'], unique=False
    )
    # The dashboard / brief query is always (site, status); dedupe lookup is by key.
    op.create_index(
        'ix_site_findings_site_status', 'site_findings', ['site_id', 'status'], unique=False
    )
    op.create_index(
        'ix_site_findings_site_dedupe', 'site_findings', ['site_id', 'dedupe_key'], unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_site_findings_site_dedupe', table_name='site_findings')
    op.drop_index('ix_site_findings_site_status', table_name='site_findings')
    op.drop_index(op.f('ix_site_findings_site_id'), table_name='site_findings')
    op.drop_table('site_findings')
