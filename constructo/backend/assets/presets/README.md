# Design Profiler preset catalog — manifest-driven ingest

`manifest.json` in this directory drives `scripts/seed_profiler_presets.py --from-dir assets/presets`.
See the `_comment` entry in `manifest.json` for the exact per-item schema.

Layout convention: real images go in a `<pack-slug>/` subdirectory next to this
file (e.g. `warm-minimal/oak-stone.jpg`, `modern-indian/jaali-facade.jpg`), and
`manifest.json` references them with that relative path.

The two images currently checked in are tiny placeholder gradients (NOT real
licensed photos) so the manifest is runnable out of the box and exercises the
real ingest path end-to-end. They exist only as a working example — swap them
out (and extend the manifest) with real photos before using this catalog for
anything real.

Target catalog (Q2, founder-supplied CivilArch project photos — the safe
licensing core; verify terms for anything sourced externally): ~6 packs
(Warm Minimal, Modern Indian, Earthy Traditional, Soft Neutrals, Bold
Contemporary, Classic Heritage) x kitchen / living / master bedroom / bath /
pooja / facade / balcony.

Re-running the seed script is idempotent (upsert identity = uuid5 of the R2
key derived from area_kind/area_key/pack/title) — safe to add photos and
re-run per batch as they arrive.
