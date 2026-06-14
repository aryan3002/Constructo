"""company_documents

Revision ID: aa7fc0979f57
Revises: 0b0c4f2ad211
Create Date: 2026-06-14 09:36:41.284570

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'aa7fc0979f57'
down_revision: str | None = '0b0c4f2ad211'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'company_documents',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('site_id', sa.UUID(), nullable=True),
        sa.Column('doc_type', sa.String(length=20), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('file_url', sa.String(), nullable=False),
        sa.Column('expiry_on', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['site_id'], ['sites.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_company_documents_company_id'),
        'company_documents',
        ['company_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_company_documents_company_id'), table_name='company_documents')
    op.drop_table('company_documents')
