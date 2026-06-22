"""Read an architectural PDF into structured info (PyMuPDF + the vision LLM).

Turns a floor plan / layout / render PDF into ``{"text", "kind", "rooms",
"summary", "pages"}`` by pairing PyMuPDF's text layer with a vision-tier LLM that
*looks* at a rasterized page (mirrors :mod:`app.extraction.vision`).

Cost/memory guards (these PDFs include many plan iterations + a 50 MB render):
read at most ``max_pages`` pages, render at a modest DPI, and downscale the
image so the base64 payload stays small.

Tolerant by contract: any fetch/parse/render/vision failure degrades to the text
layer (or empty) with ``kind == "other"`` — :func:`read_pdf` never raises.
"""
from __future__ import annotations

import base64
import binascii
import os

import fitz  # PyMuPDF

from app.extraction.llm import LLMClient, get_llm_client

_KINDS = {"floor_plan", "layout", "render", "other"}

# Render guards: ~110 DPI page raster, capped longest edge so the data URI the
# vision model receives stays modest even for a large/high-res page.
_RENDER_DPI = 110
_MAX_IMAGE_EDGE = 1600

_READ_SYSTEM = (
    "You are reading a single page from an Indian home-construction PDF — usually "
    "an architectural floor plan, a furniture/electrical layout, or a 3D render. "
    "Use the page image plus any extracted text to classify the page and list the "
    "rooms or areas visible (e.g. 'Master Bedroom', 'Drawing Room', 'Kitchen', "
    "'Pooja Room', 'Balcony'). Be factual, name only what you can actually see, "
    "and return strict JSON."
)
_READ_SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": sorted(_KINDS)},
        "rooms": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string"},
    },
    "required": ["kind", "rooms", "summary"],
}


def _empty(pages: int = 0, text: str = "") -> dict:
    """The tolerant fallback shape (also used when there is nothing to read)."""
    return {"text": text, "kind": "other", "rooms": [], "summary": "", "pages": pages}


async def _load_bytes(path_or_url: str) -> bytes | None:
    """Resolve ``path_or_url`` to PDF bytes, or ``None`` on any failure.

    Order: local file path → ``data:`` URI → storage-resolved ref. The storage
    backend turns a bare key into a local path or a presigned http(s) URL; we
    fetch http(s) with httpx and read local/``file://`` paths off disk.
    """
    try:
        # 1) An existing local path wins (cheapest, no storage/network).
        if os.path.isfile(path_or_url):
            with open(path_or_url, "rb") as fh:
                return fh.read()

        # 2) A data: URI (e.g. data:application/pdf;base64,....).
        if path_or_url.startswith("data:"):
            try:
                _, b64 = path_or_url.split(",", 1)
            except ValueError:
                return None
            try:
                return base64.b64decode(b64)
            except (binascii.Error, ValueError):
                return None

        # 3) Otherwise resolve via storage (bare key → path or presigned URL).
        from app.storage import get_storage

        resolved = get_storage().url_for(path_or_url) or path_or_url
        low = resolved.lower()
        if low.startswith(("http://", "https://")):
            import httpx

            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(resolved)
                resp.raise_for_status()
                return resp.content
        if low.startswith("file://"):
            resolved = resolved[len("file://") :]
        if os.path.isfile(resolved):
            with open(resolved, "rb") as fh:
                return fh.read()
    except Exception:
        # Tolerant by contract: any fetch error → no bytes (caller returns _empty).
        return None
    return None


def _render_page_data_uri(page: fitz.Page) -> str | None:
    """Rasterize a page to a downscaled PNG ``data:`` URI, or ``None`` on failure."""
    try:
        pix = page.get_pixmap(dpi=_RENDER_DPI)
        # Downscale if either edge is large so the base64 payload stays modest.
        longest = max(pix.width, pix.height)
        if longest > _MAX_IMAGE_EDGE:
            scale = _MAX_IMAGE_EDGE / longest
            matrix = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(dpi=_RENDER_DPI, matrix=matrix)
        png = pix.tobytes("png")
        b64 = base64.b64encode(png).decode("ascii")
        return f"data:image/png;base64,{b64}"
    except Exception:
        return None


async def read_pdf(path_or_url: str, *, llm: LLMClient | None = None, max_pages: int = 3) -> dict:
    """Read a PDF into ``{"text", "kind", "rooms", "summary", "pages"}``.

    ``kind`` is one of ``floor_plan|layout|render|other``; ``rooms`` are visible
    room/area names; ``summary`` is one line. Reads at most ``max_pages`` pages
    and renders the first page (downscaled) for the vision model. Never raises:
    on any failure it degrades to the text layer (or empty) with ``kind`` =
    ``other``.
    """
    data = await _load_bytes(path_or_url)
    if not data:
        return _empty()

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:
        return _empty()

    try:
        pages = doc.page_count
        if pages == 0:
            return _empty(pages=0)

        n = max(1, min(max_pages, pages))

        # Text layer from the first ``n`` pages.
        text_parts: list[str] = []
        for i in range(n):
            try:
                text_parts.append(doc[i].get_text())
            except Exception:
                continue
        text = "\n".join(p for p in text_parts if p).strip()

        # Render page 1 (downscaled) for the vision model.
        image_url = _render_page_data_uri(doc[0])

        # Vision pass — degrade to the text layer + "other" on any failure.
        if image_url is None:
            return {"text": text, "kind": "other", "rooms": [], "summary": "", "pages": pages}

        client = llm or get_llm_client("vision")
        user = (
            "Classify this PDF page and list the rooms/areas shown. "
            "Extracted text from the page (may be empty for image-only plans):\n"
            f"{text[:4000]}"
        )
        try:
            out = await client.complete_vision(
                system=_READ_SYSTEM,
                user=user,
                image_url=image_url,
                json_schema=_READ_SCHEMA,
            )
        except Exception:
            return {"text": text, "kind": "other", "rooms": [], "summary": "", "pages": pages}

        kind = out.get("kind")
        raw_rooms = out.get("rooms") or []
        rooms = [str(r).strip() for r in raw_rooms if isinstance(r, str) and r.strip()]
        return {
            "text": text,
            "kind": kind if kind in _KINDS else "other",
            "rooms": rooms,
            "summary": (out.get("summary") or "").strip(),
            "pages": pages,
        }
    finally:
        doc.close()
