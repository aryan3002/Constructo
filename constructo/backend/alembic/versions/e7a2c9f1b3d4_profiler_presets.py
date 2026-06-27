"""profiler_presets (curated design inspiration packs)

Revision ID: e7a2c9f1b3d4
Revises: d4f1a2b3c5e6
Create Date: 2026-06-28 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e7a2c9f1b3d4'
down_revision: str | None = 'd4f1a2b3c5e6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'profiler_presets',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('area_kind', sa.String(length=16), nullable=False),
        sa.Column('area_key', sa.String(length=64), nullable=True),
        sa.Column('pack', sa.String(length=120), nullable=False),
        sa.Column('title', sa.String(length=160), nullable=False),
        sa.Column('image_r2_key', sa.String(length=512), nullable=False),
        sa.Column('sort', sa.Integer(), server_default='0', nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    # The picker query is always (area_kind[, area_key]).
    op.create_index(
        'ix_profiler_presets_kind_key',
        'profiler_presets',
        ['area_kind', 'area_key'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_profiler_presets_kind_key', table_name='profiler_presets')
    op.drop_table('profiler_presets')
