# Freeze the published creature format

> Written by: Codex
> State: built locally, 2026-11-16; SDK/kit release pending.

The SDK override and kit dependency now use published format 0.6.0. A frozen
install restores the engine dependency to its published package and keeps only
the intended workspace kit link. Direct Node scripts and kit tests explicitly
install the format package's own raw-TypeScript hook before loading schemas.
No engine hook is needed to read the copied kit content.

SDK/kit publication and consumer archive checks remain CC2b2. Engine old-product
pins still need a normal producer rebuild before the strict hunt owner can land.
