# Wait for the cooked upload verdict

> Written by: Codex

> **State:** built locally, plan/sdk-async-upload, 2026-11-16.

SDK-SPLIT Part B SP21 (J379) waits after an async commit instead of
reporting completion while the cook has not agreed. Polling begins at
2 seconds, backs off to 15 seconds and stops after 20 minutes. Requests
bind the returned upload id/hash and carry the account credential.
Transient network/server errors retry; an authorization refusal fails
immediately. A cook refusal prints its full report. Refusal, stalled and
timeout paths exit non-zero, retaining the id for a later status read.

--no-wait prints the id without reading status. upload status <id> makes
one authenticated read without requiring a file, channel or provenance.
Legacy APIs retain their immediate behavior. After live, the existing
committed summary remains parseable by the shard publishing workflow;
pending no-wait uploads print queued and no premature placement links.

The upload command's existing argument/credential/provenance code moved
from main.ts into upload/command.ts to keep that dispatch file small.
This does not implement draft SDK package splitting or author build
changes. Polling, completion and HTTP validation have separate bounded
modules, with no background process left after the command finishes.

Initial local controls cover the actual CLI process, HTTP credential propagation,
live/refused/stalled exit behavior, no-wait and status-only calls. A fake
clock verifies backoff, exact timeout, transient recovery and identity
mismatch without sleeping. Follow-up real API/PGlite qualification is in
test/ci/async-upload.test.mjs. It checks out API main's immutable SP18
contract 2ad9890, installs its own frozen graph and runs the normal API
app, migrations, account auth, presigned R2 protocol and activation. The
candidate CLI runs from pnpm pack under node_modules, through its normal
wildshard bin and type hook, beside only its declared dependency links. Only
the trusted cook and game acknowledgement are doubles; every status
response is the real owner-only route. Live follows cooking/staged/live;
refusal prints the complete report and leaves pointers alone. The stalled
fixture seeds that existing API status; API SP20a owns its actual timer.

The same test is wired into the existing hosted check job, with no extra
matrix/job. Hosted CI remains pending the SDK milestone; this source is
not yet a completed SP21 row. Actual signed cook-parent and game transport
qualification remains SP20c, and real staging shipment SP22.

The full CLI suite caught a glossary regression in upload help. Help now
describes progress and validation in the author's vocabulary; runtime
progress still prints the actual checked/cooking/staged/live states.
The glossary guard remains unchanged.

Each individual status request has a 15-second cap inside the unchanged
20-minute overall deadline. A transient request timeout retries with the
same backoff; it cannot consume the entire wait in one hung request.

The read-only review found no MUST issues. Follow-up controls bind the
one-shot status command's returned id and retain a late authorization
failure instead of masking it as timeout. A known no-wait refusal names
the status command for reading its report, without adding a status GET.
The overall deadline remains strict: no new request starts after expiry.
