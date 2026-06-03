# Constructo backend — production image (Azure Container Apps / any OCI host).
# uv-based, Python 3.12. Dependencies are installed into /app/.venv in a cached
# layer; the entrypoint runs migrations then serves uvicorn.
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# uv binary (pinned-ish to the published image; `latest` is fine for a pilot).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# 1) Dependency layer — only re-runs when pyproject/uv.lock change.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# 2) App layer.
COPY . .

ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
