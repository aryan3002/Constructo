"""add_spec_id_to_decisions

Additive — adds a nullable `spec_id` FK on decisions so spec routing auto-creates
a linked Decision that appears in the owner's approvals inbox.
ON DELETE SET NULL keeps the audit trail intact if a spec is deleted.

Revision ID: 599a72bc7902
Revises: e6c9f3b1a528
Create Date: 2026-06-14 18:11:25.560333

NOTE: down_revision was re-pointed from the lost revision ``aa7fc0979f57`` (its
file went missing, breaking ``alembic upgrade head`` on boot) to the live prod
tip ``e6c9f3b1a528``. The body is made idempotent so it is a safe no-op on any
DB that already has the column (e.g. prod, where it was applied out-of-band).
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '599a72bc7902'
down_revision: str | None = 'e6c9f3b1a528'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c['name'] for c in insp.get_columns('decisions')}
    if 'spec_id' not in cols:
        op.add_column('decisions', sa.Column('spec_id', sa.UUID(), nullable=True))
    fks = {fk['name'] for fk in insp.get_foreign_keys('decisions')}
    if 'fk_decisions_spec_id' not in fks:
        op.create_foreign_key(
            'fk_decisions_spec_id',
            'decisions',
            'specs',
            ['spec_id'],
            ['id'],
            ondelete='SET NULL',
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    fks = {fk['name'] for fk in insp.get_foreign_keys('decisions')}
    if 'fk_decisions_spec_id' in fks:
        op.drop_constraint('fk_decisions_spec_id', 'decisions', type_='foreignkey')
    cols = {c['name'] for c in insp.get_columns('decisions')}
    if 'spec_id' in cols:
        op.drop_column('decisions', 'spec_id')
