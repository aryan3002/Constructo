"""Bridge the Design Profiler's contractor-ready brief into the Spec engine.

Determinism Doctrine: this module is PURE (no LLM, no DB). It enumerates one
material proposal per (area x approved-material-family) from the brief's
deterministic payload, and mints idempotent uuid5 ids so re-running the bridge
never duplicates Material/Spec rows (mirrors app/specs/importer.py)."""
from uuid import NAMESPACE_URL, UUID, uuid5

_NS = uuid5(NAMESPACE_URL, "constructo.profiler-bridge")


def bridge_id(*parts: object) -> UUID:
    """Deterministic uuid5 from natural-key parts (the first part is a type tag)."""
    return uuid5(_NS, "|".join(str(p) for p in parts))


def plan_proposals(payload: dict) -> list[dict]:
    """One proposal per (area, approved material family) from the brief payload.

    The payload is ``ProfilerBrief.summary_json`` (deterministic; material_families
    come only from approved/adjusted themes). Pure — no DB, no LLM."""
    out: list[dict] = []
    for area in payload.get("areas", []):
        for fam in area.get("material_families", []):
            out.append({"area_key": area["area_key"], "material_name": fam, "label": fam})
    return out
