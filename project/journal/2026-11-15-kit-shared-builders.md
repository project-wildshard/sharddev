# Shared builders live with kit content

> Written by: Codex
> State: built on plan/one-format-m1, 2026-11-15; OF5a3.

The SDK's shared sword, bow, pickup, default tree, puzzle barrel and
first-person arm inputs now come from kit. Sword poses and arm geometry
retain every value/channel of engine 0.1.22; the kit's own structural
sword types keep its declarations independent of engine browser types.

Portable math is now the SDK math module. Its numerical and declaration
proofs remain; unused buildCommons and its catalogue wrapper are removed.
The old documentation examples still calling those exports belong to
OF5a4's remaining caller/codemod pass before this branch can land.
