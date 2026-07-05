"""Manifest-driven preset ingest — pure loader (Phase 4 Task 1).

`load_manifest` must be importable and runnable with zero DB/app wiring so it
can be unit-tested directly; it validates area_kind + file existence and
raises loudly (naming the missing file) BEFORE any catalog write.
"""
import json

import pytest

from scripts.seed_profiler_presets import load_manifest


def test_load_manifest_validates_and_resolves(tmp_path):
    d = tmp_path / "warm-minimal"
    d.mkdir()
    (d / "oak.jpg").write_bytes(b"\xff\xd8jpeg")
    (tmp_path / "manifest.json").write_text(json.dumps([
        {"pack": "Warm Minimal", "title": "Oak & stone", "area_kind": "interior",
         "area_key": "kitchen", "file": "warm-minimal/oak.jpg"},
    ]))
    items = load_manifest(tmp_path)
    assert items[0].bytes_path.name == "oak.jpg" and items[0].area_key == "kitchen"


def test_load_manifest_rejects_missing_file_and_bad_kind(tmp_path):
    (tmp_path / "manifest.json").write_text(json.dumps([
        {"pack": "X", "title": "gone", "area_kind": "interior", "area_key": None,
         "file": "nope.jpg"},
    ]))
    with pytest.raises(ValueError, match="nope.jpg"):
        load_manifest(tmp_path)  # fail LOUD before any write — no partial catalogs


def test_load_manifest_rejects_unknown_area_kind(tmp_path):
    d = tmp_path / "pack"
    d.mkdir()
    (d / "a.jpg").write_bytes(b"\xff\xd8jpeg")
    (tmp_path / "manifest.json").write_text(json.dumps([
        {"pack": "X", "title": "bad kind", "area_kind": "not_a_real_kind", "area_key": None,
         "file": "pack/a.jpg"},
    ]))
    with pytest.raises(ValueError, match="not_a_real_kind"):
        load_manifest(tmp_path)


def test_load_manifest_all_or_nothing_on_second_bad_entry(tmp_path):
    """A later invalid entry must abort before the loader returns anything
    usable — no partial catalogs even when earlier entries are fine."""
    d = tmp_path / "pack"
    d.mkdir()
    (d / "a.jpg").write_bytes(b"\xff\xd8jpeg")
    (tmp_path / "manifest.json").write_text(json.dumps([
        {"pack": "X", "title": "ok", "area_kind": "interior", "area_key": None,
         "file": "pack/a.jpg"},
        {"pack": "X", "title": "gone", "area_kind": "interior", "area_key": None,
         "file": "pack/missing.jpg"},
    ]))
    with pytest.raises(ValueError, match="missing.jpg"):
        load_manifest(tmp_path)
