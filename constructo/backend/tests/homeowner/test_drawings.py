"""C3 — published drawings: the contractor publishes a drawing, the homeowner
reads it; versioning supersedes; cross-site/scope is enforced."""
from .conftest import auth


async def test_publish_drawing_appears_in_homeowner_read(client, ctx):
    pub = await client.post(
        "/api/v1/publish/drawings",
        json={
            "site_id": str(ctx.site.id),
            "title": "Ground floor plan",
            "version": "Rev A",
            "file_url": "http://cdn/gf-revA.pdf",
            "kind": "plan",
            "change_note": "Initial issue",
        },
        headers=auth(ctx.owner),
    )
    assert pub.status_code == 201, pub.text
    drawing = pub.json()
    assert drawing["version"] == "Rev A"
    assert drawing["kind"] == "plan"
    assert drawing["supersedes_id"] is None

    # The homeowner reads the same drawing.
    read = await client.get(
        f"/api/v1/homeowner/drawings?site_id={ctx.site.id}", headers=auth(ctx.homeowner)
    )
    assert read.status_code == 200, read.text
    items = read.json()
    assert len(items) == 1
    assert items[0]["id"] == drawing["id"]
    assert items[0]["title"] == "Ground floor plan"


async def test_publish_drawing_version_supersedes(client, ctx):
    rev_a = (
        await client.post(
            "/api/v1/publish/drawings",
            json={
                "site_id": str(ctx.site.id),
                "title": "Ground floor plan",
                "version": "Rev A",
                "file_url": "http://cdn/gf-revA.pdf",
            },
            headers=auth(ctx.owner),
        )
    ).json()

    rev_b = await client.post(
        "/api/v1/publish/drawings",
        json={
            "site_id": str(ctx.site.id),
            "title": "Ground floor plan",
            "version": "Rev B",
            "file_url": "http://cdn/gf-revB.pdf",
            "supersedes_id": rev_a["id"],
            "change_note": "Moved kitchen wall 300mm",
        },
        headers=auth(ctx.owner),
    )
    assert rev_b.status_code == 201, rev_b.text
    assert rev_b.json()["supersedes_id"] == rev_a["id"]

    # Both versions are listed (append-only); contractor list endpoint too.
    listed = await client.get(
        f"/api/v1/publish/drawings?site_id={ctx.site.id}", headers=auth(ctx.owner)
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 2


async def test_supersedes_must_be_same_site(client, ctx, factory, db_session):
    other_site = await factory.site(ctx.company, name="Other site")
    rev_a = (
        await client.post(
            "/api/v1/publish/drawings",
            json={
                "site_id": str(other_site.id),
                "title": "Plan",
                "version": "Rev A",
                "file_url": "http://cdn/x.pdf",
            },
            headers=auth(ctx.owner),
        )
    ).json()

    bad = await client.post(
        "/api/v1/publish/drawings",
        json={
            "site_id": str(ctx.site.id),
            "title": "Plan",
            "version": "Rev B",
            "file_url": "http://cdn/y.pdf",
            "supersedes_id": rev_a["id"],
        },
        headers=auth(ctx.owner),
    )
    assert bad.status_code == 404


async def test_homeowner_cannot_read_other_site_drawings(client, ctx, factory):
    # A homeowner not bound to a site cannot read its drawings.
    other_site = await factory.site(ctx.company, name="Unrelated")
    await client.post(
        "/api/v1/publish/drawings",
        json={
            "site_id": str(other_site.id),
            "title": "Secret plan",
            "version": "Rev A",
            "file_url": "http://cdn/secret.pdf",
        },
        headers=auth(ctx.owner),
    )
    read = await client.get(
        f"/api/v1/homeowner/drawings?site_id={other_site.id}", headers=auth(ctx.homeowner)
    )
    # resolve_site rejects a site the homeowner has no membership on.
    assert read.status_code in (403, 404)
