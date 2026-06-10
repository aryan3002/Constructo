"""spec engine: specs table + material/component fields

Revision ID: 06e1c0787f10
Revises: b5d6e7f8a9c0
Create Date: 2026-06-10 14:37:54.152292

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '06e1c0787f10'
down_revision: str | None = 'b5d6e7f8a9c0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'specs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('site_id', sa.UUID(), nullable=False),
        sa.Column('component_id', sa.UUID(), nullable=False),
        sa.Column('material_id', sa.UUID(), nullable=True),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('qty', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('unit', sa.String(), nullable=True),
        sa.Column('wastage_pct', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('unit_rate', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column(
            'approval_status',
            sa.Enum('pending', 'approved', 'rejected', name='spec_approval_status'),
            server_default='pending',
            nullable=False,
        ),
        sa.Column('client_final_code', sa.String(), nullable=True),
        sa.Column('assignee_id', sa.UUID(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['component_id'], ['components.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['site_id'], ['sites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.add_column('components', sa.Column('location', sa.String(), nullable=True))
    op.add_column('components', sa.Column('assignee_id', sa.UUID(), nullable=True))
    op.add_column(
        'components',
        sa.Column('progress_pct', sa.Integer(), server_default='0', nullable=False),
    )
    op.create_foreign_key(
        'fk_components_assignee_id_users',
        'components',
        'users',
        ['assignee_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.add_column('materials', sa.Column('brand', sa.String(), nullable=True))
    op.add_column('materials', sa.Column('sku', sa.String(), nullable=True))
    op.add_column('materials', sa.Column('colour', sa.String(), nullable=True))
    op.add_column('materials', sa.Column('finish', sa.String(), nullable=True))
    op.add_column('materials', sa.Column('size', sa.String(), nullable=True))
    op.add_column('materials', sa.Column('thickness', sa.String(), nullable=True))
    op.add_column('materials', sa.Column('catalog_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_constraint('fk_components_assignee_id_users', 'components', type_='foreignkey')
    op.drop_column('materials', 'catalog_url')
    op.drop_column('materials', 'thickness')
    op.drop_column('materials', 'size')
    op.drop_column('materials', 'finish')
    op.drop_column('materials', 'colour')
    op.drop_column('materials', 'sku')
    op.drop_column('materials', 'brand')
    op.drop_column('components', 'progress_pct')
    op.drop_column('components', 'assignee_id')
    op.drop_column('components', 'location')
    op.drop_table('specs')
    postgresql.ENUM(name="spec_approval_status").drop(op.get_bind(), checkfirst=True)
