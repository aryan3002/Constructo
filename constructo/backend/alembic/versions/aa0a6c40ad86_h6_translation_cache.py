"""H6 translation_cache (content-addressed dedup; contracts-freeze, shape only)

Revision ID: aa0a6c40ad86
Revises: 48969bafd86c
Create Date: 2026-06-01 00:00:01.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "aa0a6c40ad86"
down_revision: str | None = "48969bafd86c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "translation_cache",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("source_table", sa.String(), nullable=False),
        # No FK: source_id is polymorphic across tables (bare-UUID precedent).
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("source_field", sa.String(), server_default="text", nullable=False),
        sa.Column("lang", sa.String(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("canonical", sa.Text(), nullable=False),
        sa.Column("translated", sa.Text(), nullable=False),
        sa.Column("engine", sa.String(), nullable=False),
        sa.Column("glossary_version", sa.Integer(), server_default="0", nullable=False),
        sa.Column("style", sa.String(), server_default="hinglish_warm", nullable=False),
        sa.Column("numeric_guard_ok", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("approved", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("reviewed_by", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    # The (source_table, source_id, source_field, lang) upsert key.
    op.create_index(
        "uq_translation_cache_key",
        "translation_cache",
        ["source_table", "source_id", "source_field", "lang"],
        unique=True,
    )
    # Non-unique content-address hit-lookup.
    op.create_index(
        "ix_translation_cache_content_hash", "translation_cache", ["content_hash"]
    )


def downgrade() -> None:
    op.drop_index("ix_translation_cache_content_hash", table_name="translation_cache")
    op.drop_index("uq_translation_cache_key", table_name="translation_cache")
    op.drop_table("translation_cache")
