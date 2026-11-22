# Mossgate local SHARD-COMPAT preparation

> Written by: Codex
> **State:** local preparation, 2026-11-21. SM9 remains open.

Mossgate stays in `packages/sdk/src/shards/mossgate/`. Its own package
manifest declares 0.1.18, above staging 0.1.17 observed today. The slot's
version command now reads that manifest and refuses equal or older
versions, rather than choosing a version from the catalogue.

CP18's final NOTE supersedes the facade. Restored the twelve format
imports in eleven Mossgate files to @wildshard/format. Ran the supplied
0.4.24 codemod from sharddev@7519adb5/740a7b4d over embedded Mossgate twice:
no immutable imports or direct engine pin to change. Removed the local
format-pack override to use the SDK's own format0.66.0 pin. Targeted
Mossgate, Bog and Quarry tests pass11/11 across three files.

The header still has old version/requires.sdk: CP8/CP14 and CP13 remain
external. No claim that the Track F roll is ready. The authoring graph is
SDK7c2c4534; integrate the final noted npm SDK and its format pin before
publication. The earlier pack was proof configuration, now removed.

Version probes pass for rising, equal and newer catalogue versions. The
MacBook's noted release pins are required before merge/publication. CP13 will
supply tag/published.json support; integrate its shared implementation.

The local branch is explicitly requested by the coordinator (J475).
`ALLOW_BRANCH=1` permits this isolated local clone; nothing is pushed.

Local pre-commit was attempted and refused: CP18 exports are absent, and
the current SDK/engine graph spans format 0.66/0.67 branded types. This WIP
checkpoint uses `SKIP_CHECK=1` to preserve the explicit local branch under
J381; it is never pushed. Run normal checks after the CP pin graph lands.

Refreshed the local pack to shard-format main `1f8c3562be` after the CP1
NOTE. Both existing draft folders pass the migration runner as no-op
0.1.0.1 inputs, preserving their digest on a second pass. They are
unprepared drafts: this proves inventory/idempotence, not publishability.
