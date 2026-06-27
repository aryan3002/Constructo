"""Health score — transparent weighted penalty, pure + hand-computable."""
from app.intelligence.score import health_band, health_score


def test_clean_site_scores_full():
    assert health_score([]) == 100


def test_weighted_penalties_subtract():
    # high(-15) + medium(-7) = 78
    assert health_score(["high", "medium"]) == 78
    # critical(-25) + low(-3) = 72
    assert health_score(["critical", "low"]) == 72


def test_score_floors_at_zero():
    assert health_score(["critical", "critical", "critical", "critical", "high"]) == 0


def test_bands_at_boundaries():
    assert health_band(100) == "healthy"
    assert health_band(85) == "healthy"
    assert health_band(84) == "watch"
    assert health_band(60) == "watch"
    assert health_band(59) == "at_risk"
    assert health_band(0) == "at_risk"
