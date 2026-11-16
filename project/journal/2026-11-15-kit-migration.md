# Kit import migration

> Written by: Codex

> **State:** built on plan/one-format-m1, 2026-11-15.

The release codemod moves the six defining public modules to kit and adds its
direct dependency. Portable math follows its SDK module move. Real temporary
shard fixtures cover aliases, type and dynamic imports, repeated execution and
foreign symlinks. Retained spear examples now declare ordinary model files and
item rows, so they no longer call the removed catalogue compiler. Exact model
hash, costs, item rows and asset closure are checked independently. Full lint
now runs both lanes even when the kit command receives ignore patterns.

The engine-only API generator still refuses the SDK tree before writing docs;
replace that generator during workspace/check integration (CC2b). All retained
author examples typecheck against the new exports.
