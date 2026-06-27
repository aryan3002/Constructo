"""Seed the curated Design-Profiler preset catalog (Phase 3).

Generates a small set of pleasant gradient placeholder images (so packs render
out-of-the-box for the pilot), uploads them to the configured storage backend
(local MEDIA_DIR in dev, R2 when STORAGE_BACKEND=s3), and upserts profiler_presets
rows. Idempotent — re-running reuses the same ids (uuid5 of the R2 key) and
overwrites the image bytes, never duplicating.

Swap the generated images for real licensed designer photos by pointing
`_load_bytes` at a folder of files; the row/upsert logic is unchanged.

Run:  python -m scripts.seed_profiler_presets
"""
from __future__ import annotations

import asyncio
from io import BytesIO
from uuid import NAMESPACE_URL, UUID, uuid5

from PIL import Image, ImageDraw

from app.db import SessionLocal
from app.models.profiler import ProfilerPreset
from app.storage import get_storage

# (area_kind, area_key|None, pack, title, gradient top RGB, gradient bottom RGB)
_CATALOG: list[tuple[str, str | None, str, str, tuple[int, int, int], tuple[int, int, int]]] = [
    ("interior", "kitchen", "Warm Minimal", "Oak & stone", (224, 209, 184), (150, 120, 92)),
    ("interior", "kitchen", "Warm Minimal", "Linen calm", (238, 231, 219), (196, 178, 150)),
    ("interior", "kitchen", "Modern Mono", "Graphite & white", (238, 238, 240), (70, 72, 78)),
    ("interior", "master bedroom", "Warm Minimal", "Soft neutrals", (236, 226, 212), (171, 150, 130)),  # noqa: E501
    ("interior", "master bedroom", "Modern Mono", "Charcoal calm", (210, 212, 216), (48, 50, 56)),
    ("interior", "drawing room", "Warm Minimal", "Earthy textures", (214, 196, 170), (122, 96, 70)),
    ("interior", "drawing room", "Modern Mono", "Clean lines", (232, 233, 236), (96, 100, 108)),
    # area_key None → offered for ANY interior area
    ("interior", None, "Designer picks", "Warm wood", (208, 178, 140), (120, 86, 56)),
    ("interior", None, "Designer picks", "Soft white", (245, 243, 238), (210, 206, 198)),
    ("interior", None, "Designer picks", "Deep green", (188, 200, 184), (44, 78, 60)),
    ("house_build", None, "Facade Starters", "Warm render", (224, 210, 188), (158, 132, 104)),
    ("house_build", None, "Facade Starters", "Stone & glass", (214, 216, 220), (88, 96, 104)),
]


def _slug(*parts: str) -> str:
    raw = "-".join(parts).lower()
    return "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in raw).strip("-")


def _make_image(title: str, pack: str, top: tuple, bottom: tuple) -> bytes:
    w, h = 800, 600
    img = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        col = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (w, y)], fill=col)
    draw.text((40, h - 96), pack.upper(), fill=(255, 255, 255))
    draw.text((40, h - 64), title, fill=(255, 255, 255))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


async def seed() -> dict:
    storage = get_storage()
    created = updated = 0
    async with SessionLocal() as session:
        for sort, (area_kind, area_key, pack, title, top, bottom) in enumerate(_CATALOG):
            key = f"presets/{area_kind}/{_slug(area_key or 'any', pack, title)}.jpg"
            storage.put_bytes(key, _make_image(title, pack, top, bottom), "image/jpeg")
            ident: UUID = uuid5(NAMESPACE_URL, key)
            row = await session.get(ProfilerPreset, ident)
            if row is None:
                session.add(
                    ProfilerPreset(
                        id=ident, area_kind=area_kind, area_key=area_key, pack=pack,
                        title=title, image_r2_key=key, sort=sort,
                    )
                )
                created += 1
            else:
                row.area_kind, row.area_key, row.pack = area_kind, area_key, pack
                row.title, row.image_r2_key, row.sort = title, key, sort
                updated += 1
        await session.commit()
    return {"created": created, "updated": updated, "total": len(_CATALOG)}


if __name__ == "__main__":
    result = asyncio.run(seed())
    print(f"profiler presets seeded: {result}")
