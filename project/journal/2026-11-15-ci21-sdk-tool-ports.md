# CI21 SDK tool ports

> Written by: Codex

> **State:** held on plan/ci21-sd, 2026-11-15.

Twelve SD-TOOL files now exercise their SDK owners. The engine originals
stay pending until destination publication and the paired engine inventory
change. Import rewrites retain every original case and negative control.
Scratch stays under this checkout's tmp and is removed by each test.

The generation corruption control finds the single real index instead of
assuming the old cache layout. The runtime ceiling scan covers this SDK's
source shards discovered from the source directory. Format reader paths resolve inside the declared engine
package and use its current client/server/shared directory order.

MIDI export exposed a real installed-package bug: Node cannot strip the
engine score's TypeScript under node_modules. Register the existing engine
format hook before dynamically importing that score. The original complete
MIDI byte counts and hashes, and unknown-arrangement refusal, stay intact.

Program-discovery fixtures preserve the original authored manifests as
bytes: shard-nine-dragon src/manifest.json at
1872643c99b889ecdc86a4b812a2e4699b4e149a and shard-sky-reach src/manifest.json
at 03d234378fa8df9e524a34b18f495ddef8002cd1. They are parser inputs only;
no shard source is linked or executed. platformOutputs is the minimal
engine fixture, with only its public host import rewritten.

Seven SD-TOOL files remain open, without new exclusions or retirements:

- discovery-output-placement: installed engine does not export its
  no-binary-json CLI; original fixture also reads absent Open Plots source.
- map-source-inputs: template map inputs still name removed src/sdk and
  src/format paths; original source-owned census spans eight other repos.
- model-sources: checker is absent; the copied Blender target manifest
  still names the old monorepo's shard-owned sources and products.
- platform-runtime-closure: shard-output-report.mjs is absent locally and
  not an exported engine subpath.
- program-discovery-bootstrap: gen-programs.mjs is not exported.
- template-source-layout: lint/sim-closure.mjs is not exported; original
  source-owned map check also reads Far Reach from the SDK checkout.
- tile-bakes: tile-bake-policy.mjs is not exported.

Missing exports need engine source work and a MacBook release/pin rollout
before the SDK can prove them against its declared dependency.

J206 found the initial fixed SDK slug list could miss a future source
shard. The scan now discovers every source shard, including authoring-slice
and Mossgate, and keeps the original planted ceiling violations.
A separate existing issue remains in runtimePerformance: single-shard
projects at src/ use basename src for their first-party policy lookup.
That lookup needs a follow-up in TEST-COVERAGE row 36; this batch changes
no ceilings or runtime policy.

Validation: 12 focused files / 76 cases green in 4.87 s. The broader
SDK suite passes 233 files / 1,136 cases with one existing skip; types,
lint and format pass. The complete check stops at existing watch/build
parity: pond drift 3.864 then 3.891 against baseline 3.499 + 0.25. The
planted roof remains red. No parity or baseline source was changed.
J206's runtime scan MUST-FIX is fixed and the follow-up review is clear.
