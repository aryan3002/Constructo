"""Smoke-test the live AI stack (real Azure calls through the app's own clients).

Run from the backend/ dir so .env loads:
    uv run python -m scripts.smoke_ai

It exercises: LLM completion, the homeowner caption + weekly-summary drafters,
and embeddings. Each stage prints OK/FAIL with the exception type so a network
problem is distinguishable from a 401 (bad key) or 404 (bad deployment).
This makes REAL Azure calls and costs a few fractions of a cent.
"""
import asyncio
import os
from datetime import date

from dotenv import load_dotenv

load_dotenv(".env")


def line(title: str) -> None:
    print("\n" + "=" * 8 + " " + title + " " + "=" * 8)


async def main() -> None:
    from app.extraction.llm import get_llm_client
    from app.search.embeddings import get_embeddings_client
    from app.homeowner.ai import draft_caption, draft_weekly_summary

    line("PROVIDER SELECTION")
    llm = get_llm_client()
    emb = get_embeddings_client()
    print("LLM   client:", type(llm).__name__)
    print("Embed client:", type(emb).__name__)
    print("Deployment  :", os.environ.get("AZURE_OPENAI_DEPLOYMENT"))

    line("1) RAW LLM COMPLETE (proves gpt-4o-mini responds)")
    try:
        out = await llm.complete(
            "You translate construction jargon to one plain Hindi-English sentence a homeowner understands.",
            "Site note: slab shuttering done, deshuttering after 14 days curing.",
            {"type": "object", "properties": {"caption": {"type": "string"}}},
        )
        print("OK  ->", out)
    except Exception as e:  # noqa: BLE001
        print(f"FAIL [{type(e).__name__}] {e}")

    line("2) HOMEOWNER draft_caption()")
    try:
        cap = await draft_caption(llm, summary="kitchen wall second coat of plaster done", room_tag="Kitchen")
        print("OK  ->", cap)
    except Exception as e:  # noqa: BLE001
        print(f"FAIL [{type(e).__name__}] {e}")

    line("3) HOMEOWNER draft_weekly_summary()")
    try:
        wk = await draft_weekly_summary(
            llm,
            week_start=date(2026, 5, 26),
            update_titles=["Master bedroom flooring done", "Kitchen tiling 60%", "Waterproofing passed water test"],
        )
        print("OK  ->", wk)
    except Exception as e:  # noqa: BLE001
        print(f"FAIL [{type(e).__name__}] {e}")

    line("4) EMBEDDINGS (watch the vector length!)")
    try:
        vecs = await emb.embed(["kitchen tiling in progress", "rasoi ki tiling chal rahi hai"])
        dim = len(vecs[0])
        print(f"OK  -> {len(vecs)} vectors, dim={dim}")
        if dim != 1536:
            print(f"  ⚠ dim={dim} but your pgvector column is vector(1536). "
                  f"Either deploy text-embedding-3-small, or pass dimensions=1536 in embeddings.py.")
    except Exception as e:  # noqa: BLE001
        print(f"FAIL [{type(e).__name__}] {e}")


if __name__ == "__main__":
    asyncio.run(main())
