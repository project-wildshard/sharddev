# Generation cache, A3

Changing one imported author file used to rekey every cached step because
each key contained the whole bundled program. A two-import loader proof
reproduced both steps gaining a key; the independent step now keeps its
key and the dependent step emits the new bytes. The recipe follows lexical
helpers, captured declarations and mutations after bundling. Dynamic
higher-order callbacks keep the conservative program fallback.

Step indexes live in gen/v3/keys; their bytes live once in gen/blobs. This
pool also accepts the hardlinks from the legacy-cache cleanup, so migration
does not copy the old outputs again. A single storage lock, process leases
and successful-build receipts protect reads against collection. G430 runs
after generation in a detached low-priority worker on Mac and Linux, at
most once per ten minutes: three recent keys per job, one-day history and
a 20 GB blob cap. Protected inputs and legacy links outrank the cap.

Five outer-edge proofs cover import invalidation with captured values,
index-only shared output, legacy links, receipt/lease retention, age/size
eviction, the real worker and a real CLI build. They run under ten seconds
through an explicit CI proof config, outside hook test discovery. The CLI
proof caught TypeScript's Node os import being bundled as a browser shim;
the trusted bundler now externalizes the installed compiler entry and keys
its own resolver policy, so a prior cached bundle cannot hide that change.
Typecheck and author lint pass. The disk pass and final counts are recorded
in the requested GEN-REPORT.md outside this repository.

The explicit proof config also runs in the CI check job after pnpm check;
the hook commands remain unchanged. Its local cold-compiler CLI proof and
four storage/loader proofs passed in 5.27 seconds.
