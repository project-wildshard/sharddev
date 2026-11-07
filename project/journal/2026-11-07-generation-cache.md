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

Crash recovery exposed a real lock publication gap: an empty owner folder
stranded a reader beyond 300 ms. Replace the owner-folder mutex with a
native SQLite transaction, whose OS lock dies with its process. Two more
outer-edge proofs cover that abandoned-folder state and SIGKILL while a
real child holds the native mutex. No extra dependency or hook test.

Linux CI reproduced the smoke test's six-second child deadline: a full
product build repeated the compiler-identity work already proved by the
loader. Use the real CLI new command for the bundling/import boundary
instead; it still catches the os-shim failure without a second bake.

A real child racing the shared-pool publisher reproduced EEXIST during
population. The external deduper does not take the store's mutex: accept
its winning immutable link after checking size and SHA-256. The added
proof publishes from a second process while the store writes its private
temporary, so a background dedupe cannot fail an active build.
All eight explicit proofs pass locally in 4.77 seconds after this change.
