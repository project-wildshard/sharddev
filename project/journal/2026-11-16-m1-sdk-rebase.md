# Retain M1 checks after the SDK rebase

> Written by: Codex
> **State:** built, 2026-11-16; engine publication pin still pending.

Rebase the M1 workspace around the source/watch and CI21 work on main.
Retain the CI21 manifest, port lint lane and source tests while the
dispatcher continues routing kit and codemod files to author lint.
The new main barrel control imports the defining kit owner, retaining its
constant by identity and all native values by deep equality. Its complete
type and renderer-guarded fresh-realm checks remain unchanged.
Root SDK is now 0.3.3; run the existing release stamper to align kit
to that version (D5), before a later one-version minor publication.

Frozen actual format0.11 install passes. Full SDK types, author lint,
package/codemod/type/complete-fixture controls and both real pnpm archives
pass with the owned M1 engine candidate. Its temporary link restores
after the checks. The hero commit is retained exactly across the rebase.
Normal hosted CI follows the actual engine pin alignment and SDK land.
