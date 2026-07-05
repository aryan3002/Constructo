"""Seed the curated Design-Profiler preset catalog (Phase 3 + Phase 4 Task 1).

Two modes:

- Default (no flags): generates a small set of pleasant gradient placeholder
  images (so packs render out-of-the-box for the pilot/dev), uploads them to
  the configured storage backend (local MEDIA_DIR in dev, R2 when
  STORAGE_BACKEND=s3), and upserts profiler_presets rows.
- ``--from-dir <dir>``: reads real images from a manifest-driven directory
  (see ``assets/presets/manifest.json`` for the schema + a starter catalog)
  and ingests those instead. Both modes share the SAME upsert identity —
  uuid5 of the R2 key via ``_slug`` — so re-running (in either mode) reuses
  the same rows and overwrites image bytes, never duplicating.

Run:
    python -m scripts.seed_profiler_presets                       # gradients (dev/pilot)
    python -m scripts.seed_profiler_presets --from-dir assets/presets  # real photos
"""
from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid5

from PIL import Image, ImageDraw

from app.db import SessionLocal
from app.models.profiler import AreaKind, ProfilerPreset
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


@dataclass(frozen=True)
class ManifestItem:
    """One resolved+validated entry from a preset manifest.json."""

    pack: str
    title: str
    area_kind: str
    area_key: str | None
    bytes_path: Path


def load_manifest(directory: Path | str) -> list[ManifestItem]:
    """Pure loader — no DB, no storage I/O. Reads ``<directory>/manifest.json``
    (a JSON array; see ``assets/presets/manifest.json`` for the schema) and
    resolves+validates every entry: area_kind must be a real AreaKind value
    and ``file`` must exist on disk (resolved relative to ``directory``).

    Raises ValueError naming the offending entry BEFORE returning anything —
    a manifest with one bad entry produces zero items, never a partial list,
    so a bad batch can never write a partial catalog.
    """
    directory = Path(directory)
    manifest_path = directory / "manifest.json"
    raw_entries = json.loads(manifest_path.read_text())

    valid_kinds = {kind.value for kind in AreaKind}
    items: list[ManifestItem] = []
    for entry in raw_entries:
        if isinstance(entry, dict) and "_comment" in entry and len(entry) == 1:
            continue  # schema-documentation entry — not a real preset

        area_kind = entry["area_kind"]
        if area_kind not in valid_kinds:
            raise ValueError(
                f"manifest entry {entry.get('title')!r} has invalid area_kind "
                f"{area_kind!r}; must be one of {sorted(valid_kinds)}"
            )

        file_rel = entry["file"]
        bytes_path = (directory / file_rel).resolve()
        if not bytes_path.is_file():
            raise ValueError(
                f"manifest entry {entry.get('title')!r} references missing file "
                f"{file_rel!r} (resolved: {bytes_path})"
            )

        items.append(
            ManifestItem(
                pack=entry["pack"],
                title=entry["title"],
                area_kind=area_kind,
                area_key=entry.get("area_key"),
                bytes_path=bytes_path,
            )
        )
    return items


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
    """Gradient placeholder mode (default, no flags) — unchanged behavior."""
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


async def seed_from_manifest(directory: Path | str) -> dict:
    """Real-image mode (``--from-dir``) — validates the WHOLE manifest first
    (via `load_manifest`, which raises before any write on a bad entry), then
    uploads bytes + upserts rows through the SAME identity scheme as `seed()`.
    """
    items = load_manifest(directory)  # raises loud + early — no partial catalogs
    storage = get_storage()
    created = updated = 0
    async with SessionLocal() as session:
        for sort, item in enumerate(items):
            key = f"presets/{item.area_kind}/{_slug(item.area_key or 'any', item.pack, item.title)}.jpg"  # noqa: E501
            data = item.bytes_path.read_bytes()
            storage.put_bytes(key, data, "image/jpeg")
            ident: UUID = uuid5(NAMESPACE_URL, key)
            row = await session.get(ProfilerPreset, ident)
            if row is None:
                session.add(
                    ProfilerPreset(
                        id=ident, area_kind=item.area_kind, area_key=item.area_key,
                        pack=item.pack, title=item.title, image_r2_key=key, sort=sort,
                    )
                )
                created += 1
            else:
                row.area_kind, row.area_key, row.pack = item.area_kind, item.area_key, item.pack
                row.title, row.image_r2_key, row.sort = item.title, key, sort
                updated += 1
        await session.commit()
    return {"created": created, "updated": updated, "total": len(items)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Design-Profiler preset catalog")
    parser.add_argument(
        "--from-dir",
        default=None,
        help="directory with manifest.json + real images (see assets/presets/manifest.json); "
             "omit for the default gradient placeholder mode",
    )
    args = parser.parse_args()

    if args.from_dir:
        result = asyncio.run(seed_from_manifest(args.from_dir))
        print(f"profiler presets seeded from manifest ({args.from_dir}): {result}")
    else:
        result = asyncio.run(seed())
        print(f"profiler presets seeded: {result}")


if __name__ == "__main__":
    main()
