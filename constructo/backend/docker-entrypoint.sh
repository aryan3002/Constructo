#!/usr/bin/env sh
# Container entrypoint: apply DB migrations (idempotent) then serve the API.
#
# RUN_MIGRATIONS=true (default) runs `alembic upgrade head` on boot — safe for a
# single-replica pilot (Container Apps min=max=1). Set it to false and migrate
# out-of-band once you scale to multiple replicas, so they don't race.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] alembic upgrade head…"
  alembic upgrade head
fi

echo "[entrypoint] starting uvicorn on :${PORT:-8000}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
