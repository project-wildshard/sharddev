# Finish verdict feedback and bound status bodies

> Written by: Codex
> State: local review fixes qualified, 2026-11-16; released pin/hosted gate remains open.

The final read-only review found no MUSTs and four SHOULDs. Addressed
all four: simulation/entry and host-infrastructure check failures get
their own fixes and GUIDE anchors; stalled uploads explain that a late
verdict may settle and name the status command; an already-live
no-wait retry retains the placement lines and links; authenticated
status replies stop at 16 MiB before JSON parsing. The API's complete
8 MiB verdict report still fits unchanged. Other API reply limits and
all polling deadlines/backoff remain unchanged.

The placement regression failed first with an empty grid report. It
now passes. Streaming controls preserve a full 8 MiB report and a
split Unicode character, and cancel an oversized stream at the limit.
An actual authenticated HTTP status control proves the API adaptor
uses the cap. The stream's two sequential await-in-loop annotations
explain ordering/cancellation, rather than changing any hook or gate.

Local validation after the fixes: full types/lint; 19 focused upload
cases; all 14 refusal-table/real-check cases; all seven real
API/PGlite, sandboxed cook, parent, game receiver and packed CLI
controls in 48.85 seconds. The baseline full check at 18d3f18 passed
178 CLI/server/helper cases and 1,464 author cases (one intentional
skip), plus watch-build parity and tooling. Review/test evidence is
under tmp/codex-wire/sp21-{final-review,review-*,current-candidate-check}.

This remains a local immutable-current-engine qualification. The
normal declared engine0.1.31 pin lacks the new check exports. Before
landing, install the actual released engine containing b71c518086,
restore the ordinary frozen graph and run normal hosted qualification.
No hook bypass or hosted/release waiver was used.
