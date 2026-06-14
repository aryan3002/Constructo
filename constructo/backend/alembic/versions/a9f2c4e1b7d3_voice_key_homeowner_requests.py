"""voice note: voice_key on homeowner_requests

Adds the R2 object key for an optional voice note attached to a homeowner
request/issue. Audio lives in the private media bucket under
``homeowner/<site>/voice/<uuid>.m4a``; reads resolve to a short-lived presigned
GET (mirrors photos). Additive + nullable — no backfill, no data loss.

Revision ID: a9f2c4e1b7d3
Revises: d4f1a2b7c8e9
Create Date: 2026-06-14 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a9f2c4e1b7d3'
down_revision: str | None = 'd4f1a2b7c8e9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "homeowner_requests",
        sa.Column("voice_key", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("homeowner_requests", "voice_key")
