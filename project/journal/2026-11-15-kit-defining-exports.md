# Kit owns the six defining modules

> Written by: Codex
> State: built on plan/one-format-m1, 2026-11-15; OF5a4a.

The six public author modules now live in kit. Their SDK exports and
implementations are removed, with no forwarding module. Geometry,
structural types and authored species data share one defining module;
body recipes take that module's compiler so there is no runtime cycle.
All 22 committed GLBs still rebuild to identical bytes.

Weapon metadata takes host vocabulary type parameters. Specializing
those with the engine's existing vocabulary preserves the complete
previous type contract, without an engine import in kit. The starter
sword keeps its existing concrete names and exact rich values.

The six module import probes refuse any engine resolution and pass;
the six old SDK export paths refuse. The ordinary SDK source-resolution
hook is needed for its TypeScript source package, as before. Caller
codemods, doc examples and shard oracles remain OF5a4b/c before land.
