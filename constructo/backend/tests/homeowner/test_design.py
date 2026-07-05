"""H0 design: references, selections, AI-drafted design profile (FakeLLM), and
the advisory (never-gatekeeping) consistency check."""
from .conftest import auth

JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIFfake-bytes"


async def test_reference_upload_persists_real_bytes_and_resolves(
    client, ctx, tmp_path, monkeypatch
):
    """P1: the Design tab's "add a photo" flow must actually upload the image
    to storage and get back a real object key — not record the device's local
    file path (file://...) as if it were a permanent, fetchable URL. That is
    exactly what made every reference photo render as a broken image."""
    monkeypatch.setattr("app.config.settings.media_dir", str(tmp_path))

    uploaded = await client.post(
        "/api/v1/homeowner/design/references/upload",
        files={"media": ("inspo.jpg", JPEG, "image/jpeg")},
        headers=auth(ctx.homeowner),
    )
    assert uploaded.status_code == 201, uploaded.text
    key = uploaded.json()["image_url"]
    assert key.startswith(f"homeowner/{ctx.site.id}/design/")
    # Bytes actually landed in storage under that key (local backend in tests).
    assert (tmp_path / key).read_bytes() == JPEG

    ref = await client.post(
        "/api/v1/homeowner/design/references",
        json={"image_url": key, "room_tag": "living", "source": "upload"},
        headers=auth(ctx.homeowner),
    )
    assert ref.status_code == 201, ref.text
    # Resolved on the way out (mirrors test_reference_key_is_served_as_resolved_url)
    # — the value the app renders points at a real object, not a dead reference.
    out_url = ref.json()["image_url"]
    assert key in out_url
    assert out_url != key


async def test_reference_upload_rejects_non_image(client, ctx, tmp_path, monkeypatch):
    monkeypatch.setattr("app.config.settings.media_dir", str(tmp_path))
    resp = await client.post(
        "/api/v1/homeowner/design/references/upload",
        files={"media": ("note.txt", b"hello", "text/plain")},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 415, resp.text


async def test_references_and_selections(client, ctx):
    ref = await client.post(
        "/api/v1/homeowner/design/references",
        json={"image_url": "http://pin/1.jpg", "room_tag": "living", "source": "pinterest"},
        headers=auth(ctx.homeowner),
    )
    assert ref.status_code == 201, ref.text
    assert ref.json()["source"] == "pinterest"

    sel = await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "living room flooring", "choice": "oak engineered wood"},
        headers=auth(ctx.homeowner),
    )
    assert sel.status_code == 201, sel.text

    listed = await client.get(
        "/api/v1/homeowner/design/selections", headers=auth(ctx.homeowner)
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["choice"] == "oak engineered wood"


async def test_reference_key_is_served_as_resolved_url(client, ctx):
    """P1-6: an inspiration image stored as a bare object KEY (private bucket)
    must be returned as a resolved/presigned URL, not the raw key — otherwise it
    renders as a blank thumbnail. A plain http(s) URL is passed through unchanged.
    """
    # Bare key (as a real R2 upload stores it) -> must be resolved on the way out.
    created = await client.post(
        "/api/v1/homeowner/design/references",
        json={"image_url": "inspo/kids-room.jpg", "source": "upload"},
        headers=auth(ctx.homeowner),
    )
    assert created.status_code == 201, created.text
    out_url = created.json()["image_url"]
    # Resolved, not the bare key. Under S3/R2 this is a presigned GET URL; under
    # local storage it's a media_dir-prefixed path. Either way the key path is
    # embedded and the value is no longer the raw key.
    assert out_url != "inspo/kids-room.jpg"
    assert "inspo/kids-room.jpg" in out_url

    # List path uses the same serializer -> also resolved.
    listed = await client.get(
        "/api/v1/homeowner/design/references", headers=auth(ctx.homeowner)
    )
    keys = [r["image_url"] for r in listed.json()]
    assert all(k != "inspo/kids-room.jpg" for k in keys)
    assert all("inspo/kids-room.jpg" in k for k in keys)

    # http(s) links are passed through untouched (legacy/stock references).
    http_ref = await client.post(
        "/api/v1/homeowner/design/references",
        json={"image_url": "https://pin/abc.jpg", "source": "pinterest"},
        headers=auth(ctx.homeowner),
    )
    assert http_ref.json()["image_url"] == "https://pin/abc.jpg"


async def test_ai_design_profile_generated_then_confirmed(client, ctx, fake_llm):
    # Seed intake so the AI draft has something to summarise.
    await client.post(
        "/api/v1/homeowner/design/references",
        json={"image_url": "http://pin/2.jpg", "room_tag": "kitchen"},
        headers=auth(ctx.homeowner),
    )
    await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "kitchen counter", "choice": "quartz"},
        headers=auth(ctx.homeowner),
    )

    # No profile body -> server AI-drafts one (FakeLLM, no network).
    drafted = await client.put(
        "/api/v1/homeowner/design/profile", json={}, headers=auth(ctx.homeowner)
    )
    assert drafted.status_code == 200, drafted.text
    profile = drafted.json()["profile"]
    assert profile["profile"]  # non-empty drafted text
    assert "tone" in profile

    # Homeowner confirms/adjusts and PUTs the final profile verbatim.
    confirmed = await client.put(
        "/api/v1/homeowner/design/profile",
        json={"profile": {"profile": "warm, minimal, lots of wood", "tone": ["warm", "minimal"]}},
        headers=auth(ctx.homeowner),
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["profile"]["tone"] == ["warm", "minimal"]

    got = await client.get("/api/v1/homeowner/design/profile", headers=auth(ctx.homeowner))
    assert got.status_code == 200
    assert got.json()["profile"]["profile"] == "warm, minimal, lots of wood"


async def test_consistency_check_is_advisory_not_a_gate(client, ctx, fake_llm):
    resp = await client.post(
        "/api/v1/homeowner/design/consistency-check",
        json={"item": "bathroom tile", "choice": "neon pink"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Seek-feedback-not-gatekeep: never blocks (fits defaults true), always advises.
    assert body["fits"] is True
    assert body["feedback"]
