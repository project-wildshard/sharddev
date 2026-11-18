# Template loading-renderer baseline

> Written by: Codex
> **State:** Measured 2026-11-17 for MEMORY-GATES MG11 and ENGINE-MEMORY.

The `_template` product `bb3c71a7` used preparation client `4a7ba050`,
the same client as Pine, Driftwood and Sky Reach. It is the minimal
content baseline for shared boot work. The fixture still draws its
authored ground and props. The headless Chromium run used phone Low,
a 402 × 874 viewport at DPR 3 and no service worker.

The survey's maximum was 475 MB of native renderer footprint. The
profile sampled `modules` at 1.519 s and 425 MB, matching MG11's 424 MB
raw reading. That point corresponds to 850 MB with the existing
renderer ×2 calibration. One loading ledger, one 16 KiB V8 allocation
sample and one heap snapshot were captured before control. At trigger,
the main isolate reported 44.6 MB JS used, 72.7 MB heap capacity and
66.2 MB backing storage. The boot reached control.

| Bucket over 50 MB | MB | Owner and evidence |
| --- | ---: | --- |
| Native malloc | 191 | Shared browser and engine. 170 MB of effective live allocated objects. The allocator also exposes larger, overlapping size totals. |
| Native PartitionAlloc | 99 | Chromium and shared engine. ArrayBuffer allocated objects account for 57 MB. |
| Native V8 main heap | 73 | Shared V8 and boot code. The isolate's separate malloc attribution is 109 MB. |
| Native V8 worker malloc | 337 | Shared Chromium and engine. Three unnamed V8 isolates each account for about 112 MB in this allocator view. The worker heap itself is 32 MB. |
| Live main-isolate backing storage at trigger | 66 | Mixed, mostly shared boot input and geometry lifetimes. Post-collection backing stores total 40 MB, including 27 MB reached from geometry and 1.9 MB of Template product wire bytes. |

The detailed native survey sampled a separate `modules` boot at 401 MB
renderer footprint. Its V8 malloc and native malloc figures overlap and
cannot be added to the footprint. Worker targets included the standalone
server and two tile decoders. The dump cannot name the worker behind
each isolate. Template reproduces the large per-isolate malloc buckets
seen in Sky Reach with little content present.

The snapshot retained 99 MB in all, including 36 MB of JS objects and
code. The sample estimated 164 MB of cumulative allocation, including
collected work. Three modules account for 41 MB and format/schema
modules for 24 MB. No mapped source file reaches 50 MB on its own.
The loading ledger totals 33 MB RAM and 32 MB GPU. Render-target
textures account for 14.7 MB. The Template prop merge accounts for
12.1 MB CPU and 12.1 MB GPU buffers. Those are useful control values
for comparing bigger zones.

The Mac mini evidence is under
`~/.cache/wildshard/plan-artifacts/memory-gates/zone-loading-peaks-2026-11-17/_template`.
The allocation receipt is addressed to mini-ninemem2 and mini-memplan.
