# SDK Blender inspection fixture

> Written by: Codex
> State: source ownership, 2026-11-16.

`build.sh` runs from a repo's root and reads its manifest at
`src/blender/targets.json`; a shard runs the installed copy,
`bash node_modules/@wildshard/sdk/scripts/blender/build.sh <target>`,
and a manifest's `pre`, `post` and `args` name this package as `$SDK`.
A shard's old `scripts/blender/targets.json` still reads, with a
warning, for this SDK minor only (meta QA 11-25 row 126).

This folder's `targets.json` owns the SDK inspection producer `sdk-world-fixture`.
Its script is `lib/world_fixture.py`; it builds a local `world.glb` for
inspection, and stores no generated GLB in this package. Run it through
`build.sh sdk-world-fixture` when a Blender inspection is needed.

Content targets belong to their shard repositories. The exact former
rows and their owners are recorded in
`test/fixtures/ci21-model-source-owners.json`; removing those SDK rows
deletes no source or artifact from the content owner.

`node scripts/check-model-sources.mjs [project]` checks the caller's
source manifest, outputs, orphan scripts and `.blend` refusal. Each
content project records other-pipeline GLBs in its own `notBlender` map.
An exported project's root `tmp/` and `.worktrees/` are generated scratch;
nested source directories with those names remain subject to the check.
