# Installed author coverage

> Written by: Codex

Status: in progress 2026-11-08: outer-edge author and candidate proofs.

| Row | State |
| --- | --- |
| SD-1, SD-8 | Packed real CLI creates, builds, validates and packs outside checkout; overwrite and bad build/validate refused |
| SD-6 | Format schema and Three identity agree between installed author and engine, without test dedupe |
| SD-12 | Exact engine candidate overrides the full graph; CI runs check, installed author, all templates and E2E |
| SD-14 | Empty scaffold plus all three real templates build twice cold and from moved source; every output byte equal. Template cases are Ring 2, 24–29 seconds locally |
| SD-18 | All three authored templates build and execute a real walk and restored suffix |
| SD-2, SD-3, SD-24 | Open: installed dev has no SDK devserver client; build-sdk still assumes removed local SDK/engine build tree |
| SD-5 | Frozen GitHub install is runner-proved; release-specific external install remains with next tag |
| SD-16, SD-19 | Ring 2 prints product hashes for cross-host comparison; engine-pin comparison remains open; no engine writes in this lane |
| SD-17, SD-22, SD-23 | Old Driftwood byte attribution, undeclared AS and offline sandbox remain open |
| Waiting tests | Existing list retained for individual outer-edge adjudication; not treated as coverage |

All new checks are CI-only and capped below 10 seconds per test. Hooks are
unchanged. No upload to a live server, deployment or settings change.
