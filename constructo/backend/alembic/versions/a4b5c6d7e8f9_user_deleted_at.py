"""User deleted_at flag (self-service account deletion)

Adds ``users.deleted_at`` (nullable timestamp) so self-service account
deletion (DELETE /api/v1/users/me) can be distinguished from an
owner-initiated `is_active=False` deactivation, which stays reversible.
Deletion also sets `is_active=False` (reusing the existing auth lockout in
`get_current_user`) and scrubs `name`/`phone` in place rather than
hard-deleting the row, since ~40 FKs from `users.id` are attribution
columns on shared project history (decisions, audits, payments, photos)
that the rest of the project team still relies on.

Revision ID: a4b5c6d7e8f9
Revises: e00cf9f193c2
Create Date: 2026-07-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a4b5c6d7e8f9"
down_revision: str | None = "e00cf9f193c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "deleted_at")
