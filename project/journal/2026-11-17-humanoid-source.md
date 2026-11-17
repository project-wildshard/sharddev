# A configurable plain humanoid

> Written by: Codex
> State: ONE-FORMAT CC10a2b2a source, 2026-11-17.

The public humanoidSource reuses the reference biped builder and defining
socket table. Authors can replace the head and add head/hand/chest/back
or mouth geometry in bone-local metres. Caller attributes and indices
remain exact; rigid skin weights use existing joints, and merged output
retains vertex colours. The head radius is measured from copied inputs.

Free scale stays in the original CreatureBody policy. Three scales keep
identical unit GLB bytes and binds; no second geometry multiplier or
controller is created. All six sockets, head replacement, input ownership,
unknown sockets and finite position controls are exercised.

The ordinary project proof uses public Kit/SDK imports and ctx.cached
shape inputs, returning actual GLB and skin metadata through output.assets.
Its first actual build exposed format23 rejecting empty clip lists;
CC10a2b2f fixes that defining contract and publishes it before integration.
The engine's actual loaded-mesh/default-volume proof is CC10a2b2b.
Source logs live in root tmp/codex-te2e/cc10a2b2a-*. Meta records final
source and hosted qualification; graphics remain Needs Opus.

Registry0.24.0 is published from f301824 (exact releaseCI44196781492
and npm44197813321 green). Every SDK workspace alias/override and the
Kit direct defining dependency now use that version. Three ordinary
project outputs admit with identical unit GLB bytes and distinct body
scale policy. Import/build controls and frozen install also pass.
