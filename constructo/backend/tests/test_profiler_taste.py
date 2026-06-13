"""Deterministic taste reducer — pure functions, hand-computable assertions."""
from app.profiler.taste import (
    aggregate_dimension_scores,
    build_taste_model,
    check_consistency,
    confidence_score,
    detect_conflicts,
    star_weight,
)


def test_star_weight_maps_1_to_5():
    assert star_weight(5) == 1.0
    assert star_weight(4) == 0.5
    assert star_weight(3) == 0.0
    assert star_weight(2) == -0.5
    assert star_weight(1) == -1.0


def test_aggregate_sums_star_weighted_attribute_values():
    attrs = [
        {"reference_id": "r1", "attributes": {"style": "minimal", "colors": "light"}},
        {"reference_id": "r2", "attributes": {"style": "ornate", "colors": "dark"}},
    ]
    rankings = [
        {"reference_id": "r1", "contributor_id": "A", "stars": 5, "tags": {}},  # +1.0
        {"reference_id": "r2", "contributor_id": "A", "stars": 1, "tags": {}},  # -1.0
    ]
    scores = aggregate_dimension_scores(rankings, attrs)
    assert scores["style"]["minimal"] == 1.0
    assert scores["style"]["ornate"] == -1.0
    assert scores["colors"]["light"] == 1.0
    assert scores["colors"]["dark"] == -1.0


def test_negative_quick_tag_suppresses_a_dimension_value():
    attrs = [{"reference_id": "r1", "attributes": {"lighting": "dark"}}]
    rankings = [{"reference_id": "r1", "contributor_id": "A", "stars": 4,
                 "tags": {"positive": [], "negative": ["too_dark"]}}]
    scores = aggregate_dimension_scores(rankings, attrs)
    # +0.5 from the 4-star, then -1.0 from the too_dark tag => -0.5
    assert scores["lighting"]["dark"] == -0.5


def test_confidence_is_coverage_ratio_clipped_to_one():
    assert confidence_score(0, 6) == 0.0
    assert confidence_score(3, 6) == 0.5
    assert confidence_score(8, 6) == 1.0
    assert confidence_score(2, 0) == 0.0


def test_detect_conflict_between_two_contributors():
    attrs = [{"reference_id": "r1", "attributes": {"colors": "dark"}}]
    rankings = [
        {"reference_id": "r1", "contributor_id": "A", "stars": 5, "tags": {}},  # likes dark
        {"reference_id": "r1", "contributor_id": "B", "stars": 1, "tags": {}},  # dislikes dark
    ]
    conflicts = detect_conflicts(rankings, attrs)
    assert len(conflicts) == 1
    c = conflicts[0]
    assert c["dimension"] == "colors" and c["value"] == "dark"
    assert {c["contributor_a"], c["contributor_b"]} == {"A", "B"}


def test_no_conflict_when_contributors_agree():
    attrs = [{"reference_id": "r1", "attributes": {"colors": "dark"}}]
    rankings = [
        {"reference_id": "r1", "contributor_id": "A", "stars": 5, "tags": {}},
        {"reference_id": "r1", "contributor_id": "B", "stars": 5, "tags": {}},
    ]
    assert detect_conflicts(rankings, attrs) == []


def test_check_consistency_flags_against_strong_negative():
    scores = {"colors": {"dark": -1.0}, "style": {}, "materials": {}, "lighting": {}}
    assert check_consistency({"colors": "dark"}, scores)["status"] == "conflict"
    assert check_consistency({"colors": "light"}, scores)["status"] == "consistent"


def test_build_taste_model_assembles_everything():
    attrs = [{"reference_id": "r1", "attributes": {"colors": "dark"}}]
    rankings = [
        {"reference_id": "r1", "contributor_id": "A", "stars": 5, "tags": {}},
        {"reference_id": "r1", "contributor_id": "B", "stars": 1, "tags": {}},
    ]
    model = build_taste_model(rankings, attrs, recommended_count=2)
    assert model["ranked_count"] == 1
    assert model["confidence"] == 0.5  # 1 ranked ref / 2 recommended
    assert model["has_conflict"] is True
    assert model["dimensions"]["colors"]["dark"] == 0.0  # +1.0 + -1.0
