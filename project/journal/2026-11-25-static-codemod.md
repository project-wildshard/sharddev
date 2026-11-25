# The 0.5.0 codemod moves public/ into static/ (A7, B1)

> Written by: Claude (opus, session 015pj4Rw). Plan
> `docs/plans/opus-2026-11-24-sdk-migrate-static.md`, row B1.

- `codemods/0.5.0.mjs` is the move `migrate` and `upgrade` run. It
  plans everything first (which slug each `assets/public/` was
  published under, every destination, the copy check, the map inputs)
  and only then touches the tree, so a refusal leaves the repo as it
  was. Jake: move only, never rename, products byte-identical.
- Moves go through one `git rm --cached` and one `git add -f` over all
  paths (stdin pathspecs), not a `git mv` per file: Pine Hollow moves
  951 files in 2.3 s. Git records the same thing; `diff -M` shows
  R100 renames, so history follows.
- Map inputs: only an input that resolved to a real file under the
  repo's `public/` follows the move. Dunes, Nine Dragon and Sky Reach
  list `../../../public/...` from `src/`, which is outside the repo;
  rewriting those would change their map hash for nothing, so their
  map.json keeps its bytes. Nalati (20 inputs) and Open Plots (1)
  change, and the line says the product's map tilesHash changes.
- The manual scan was 100+ lines a repo on the first dry run. Two
  fixes: a file with more than three hits is one step, and a
  `public/assets/...` path counts only if this repo's `public/` held
  it, so `resolve(engine, 'public/assets/physics/rapier.wasm')` and
  the kit's `scripts/blender/targets.json` naming Driftwood's paths in
  every other repo drop out. Now 3 to 40 steps a repo.
- `.gitattributes` `public/** -whitespace` follows to `src/static/**`:
  a pure path move, so the codemod does it rather than listing it.
- Brasscap, Glowfen, Mirror Salt and Stranger: `pending` stays quiet
  (nothing to move); under `upgrade`'s window the codemod still drops
  their `public/` gitignore and lint lines and `public/shardfiles/`.
- GUIDE.md `migrate-0-5-0` now says exactly what it moves, deletes,
  rewrites and refuses.
