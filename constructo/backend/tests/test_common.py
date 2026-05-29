import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.common.errors import AppError, install_error_handlers
from app.common.pagination import Page, decode_cursor, encode_cursor


def test_cursor_roundtrip():
    assert decode_cursor(encode_cursor("abc-123")) == "abc-123"
    assert decode_cursor(None) is None
    assert encode_cursor(None) is None


def test_page_shape():
    page = Page[int](items=[1, 2, 3], next_cursor="xyz")
    dumped = page.model_dump()
    assert dumped == {"items": [1, 2, 3], "next_cursor": "xyz"}


async def test_app_error_envelope():
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/boom")
    async def boom():
        raise AppError(status_code=403, code="forbidden", message="nope")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/boom")
    assert resp.status_code == 403
    assert resp.json() == {"error": {"code": "forbidden", "message": "nope"}}


async def test_http_exception_mapped_to_envelope():
    app = FastAPI()
    install_error_handlers(app)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/does-not-exist")
    assert resp.status_code == 404
    body = resp.json()
    assert set(body["error"].keys()) == {"code", "message"}


async def test_validation_error_mapped_to_envelope():
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/needs-param")
    async def needs_param(n: int):  # missing required query param -> 422
        return {"n": n}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/needs-param")
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


def test_cursor_rejects_tampered_value():
    with pytest.raises(ValueError):
        decode_cursor("!!!not-base64!!!")
