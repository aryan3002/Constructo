"""published_photos.source_chat_message_id (chat "Send to feed")

Adds the link from a curated feed photo back to the chat message it was
published FROM, so the endpoint is idempotent (one message → at most one feed
photo) and the chat message-out can flag "already in the feed".

Revision ID: f9b3c1d2e4a5
Revises: e7a2c9f1b3d4
Create Date: 2026-07-02 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f9b3c1d2e4a5'
down_revision: str | None = 'e7a2c9f1b3d4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'published_photos',
        sa.Column('source_chat_message_id', sa.UUID(), nullable=True),
    )
    # One message maps to at most one feed photo (the endpoint dedupes on it).
    op.create_unique_constraint(
        'uq_published_photos_source_chat_message_id',
        'published_photos',
        ['source_chat_message_id'],
    )
    # SET NULL: keep the published photo even if the source chat message is
    # later hard-deleted (the photo is a curated, standalone artifact).
    op.create_foreign_key(
        'fk_published_photos_source_chat_message_id',
        'published_photos',
        'chat_messages',
        ['source_chat_message_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_published_photos_source_chat_message_id',
        'published_photos',
        type_='foreignkey',
    )
    op.drop_constraint(
        'uq_published_photos_source_chat_message_id',
        'published_photos',
        type_='unique',
    )
    op.drop_column('published_photos', 'source_chat_message_id')
