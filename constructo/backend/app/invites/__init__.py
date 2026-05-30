"""Team-invite module: owner/PM invites a phone+role, generates a join link,
the invited user accepts and lands in their role-specific first-run.

Mirrors the Wave-1 pattern in `app/sites/` (a feature ORM table registered on the
shared Base.metadata without a new Alembic migration; the test suite builds the
schema via create_all). Imports the frozen core models from `app.models`.
"""
