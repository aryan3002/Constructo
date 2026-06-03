"""R1 homeowner visit photos — homeowner_visit_photos table

The homeowner's OWN uploaded "site visit" photos (the My-visits tab). Private to
the household; ``storage_key`` is the object-storage (R2) key, resolved to a
short-lived presigned GET URL at read time. ``site_id`` CASCADEs; ``member_id``
(the uploader) SET NULLs if the member is later removed.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-06-02 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8c9d0e1f2a3"
down_revision: str | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "homeowner_visit_photos",
        sa.Column("id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("site_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("member_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("storage_key", sa.String(), nullable=False),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["member_id"], ["homeowner_members.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_homeowner_visit_photos_site_member",
        "homeowner_visit_photos",
        ["site_id", "member_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_homeowner_visit_photos_site_member", table_name="homeowner_visit_photos"
    )
    op.drop_table("homeowner_visit_photos")
