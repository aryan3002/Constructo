"""Profiler -> Spec engine bridge: pure deterministic planning (no LLM, no DB)."""
from app.profiler.bridge import bridge_id, plan_proposals


def test_plan_proposals_enumerates_one_per_area_material_family():
    payload = {"areas": [
        {"area_key": "kitchen", "material_families": ["light oak", "quartz"]},
        {"area_key": "bath", "material_families": []},
    ]}
    out = plan_proposals(payload)
    assert out == [
        {"area_key": "kitchen", "material_name": "light oak", "label": "light oak"},
        {"area_key": "kitchen", "material_name": "quartz", "label": "quartz"},
    ]
    assert plan_proposals({}) == []
    assert plan_proposals({"areas": []}) == []


def test_bridge_id_is_deterministic_and_distinct():
    a = bridge_id("material", "c1", "oak")
    assert a == bridge_id("material", "c1", "oak")  # stable across calls
    assert bridge_id("material", "c1", "teak") != a  # distinct inputs -> distinct id
    assert bridge_id("spec", "c1", "oak") != a       # namespace prefix matters
