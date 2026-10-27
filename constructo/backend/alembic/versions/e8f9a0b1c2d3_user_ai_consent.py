"""When a person agreed to AI processing (S7)

Adds the nullable ``users.ai_consent_at``: set once, the first time the person
agrees that their photos, voice notes, chat messages and documents may be sent
to the AI providers (OpenAI / Azure OpenAI). Null means they haven't, and the
apps show the consent screen before anything else.

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-10-27 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e8f9a0b1c2d3"
down_revision: str | None = "d7e8f9a0b1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("ai_consent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "ai_consent_at")
