"""Design-fidelity detector: a finalized material that clashes with the homeowner's
approved taste for that area. Reuses profiler taste.check_consistency. Pure."""
from app.intelligence.detectors.design import (
    AreaTaste,
    SpecRow,
    material_theme_clash,
    material_to_attrs,
)

# ---- material_to_attrs: concrete material -> taste vocabulary ----

def test_maps_colour_and_material_to_taste_vocab():
    attrs = material_to_attrs(colour="Charcoal Black", finish="matte", material="Steel")
    assert "dark" in attrs["colors"]
    assert "metal" in attrs["materials"]


def test_maps_light_warm_materials():
    attrs = material_to_attrs(colour="Off White", finish="matte", material="Oak Wood")
    assert "light" in attrs["colors"]
    assert "wood" in attrs["materials"]


def test_unmappable_material_yields_no_attrs():
    assert material_to_attrs(colour=None, finish=None, material="Mystery Compound") == {}


# ---- material_theme_clash ----

def _kitchen_taste():
    # homeowner likes light + wood, dislikes dark + metal
    return AreaTaste(area_key="kitchen", dimensions={
        "colors": {"light": 1.0, "dark": -1.0},
        "materials": {"wood": 1.0, "metal": -1.0},
    })


def _spec(area_key, colour, material, label="Counter"):
    return SpecRow(id=f"s-{label}", label=label, colour=colour, finish="matte",
                   material=material, area_key=area_key)


def test_clashing_material_flags_finding():
    specs = [_spec("kitchen", "Charcoal", "Steel")]
    out = material_theme_clash(specs, [_kitchen_taste()])
    assert len(out) == 1
    assert out[0].finding_type == "material_theme_clash"
    assert out[0].phase == "design"
    assert "kitchen" in out[0].detail.lower()


def test_matching_material_is_quiet():
    specs = [_spec("kitchen", "Cream", "Oak Wood")]
    assert material_theme_clash(specs, [_kitchen_taste()]) == []


def test_abstains_when_area_has_no_taste_signal():
    empty = AreaTaste(area_key="kitchen", dimensions={})
    specs = [_spec("kitchen", "Charcoal", "Steel")]
    assert material_theme_clash(specs, [empty]) == []


def test_abstains_when_spec_has_no_matching_area():
    specs = [_spec("bathroom", "Charcoal", "Steel")]  # no bathroom taste
    assert material_theme_clash(specs, [_kitchen_taste()]) == []
