"""add_spec_id_to_decisions

Additive — adds a nullable `spec_id` FK on decisions so spec routing auto-creates
a linked Decision that appears in the owner's approvals inbox.
ON DELETE SET NULL keeps the audit trail intact if a spec is deleted.

Revision ID: 599a72bc7902
Revises: aa7fc0979f57
Create Date: 2026-06-14 18:11:25.560333

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '599a72bc7902'
down_revision: str | None = 'aa7fc0979f57'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('decisions', sa.Column('spec_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_decisions_spec_id',
        'decisions',
        'specs',
        ['spec_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_decisions_spec_id', 'decisions', type_='foreignkey')
    op.drop_column('decisions', 'spec_id')
