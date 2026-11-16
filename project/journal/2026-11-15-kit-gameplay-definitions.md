# Copy complete gameplay definitions into kit

> Written by: Codex
> State: OF5a1 built locally, 2026-11-15; M1 land pending.

The complete shared boar and bear metadata now have plain JSON files and a
callback-free commonSpeciesRows reader in kit. These are the existing native
gameplay rows needed for byte parity, separate from OF3's new layered species
and GLB assets. No geometry or runtime registration moves in this step.

The direct SDK comparison proves identical serialized fields for both kinds
under an authored id. It includes the ordered six boar/five bear variants,
their optional overrides, sounds and full tuning. Mutating a returned variant
list or nested tuning does not change another returned row. Three focused
SDK species cases and kit type/lint checks pass.

The kit reader imports only format/valibot and its plain JSON; the SDK's old
reader remains until OF5a2/OF5a4 move the builders and remove its public export.
No old public path is replaced with a shim.
