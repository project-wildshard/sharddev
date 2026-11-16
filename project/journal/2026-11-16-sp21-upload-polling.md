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

Local controls cover the actual CLI process, HTTP credential propagation,
live/refused/stalled exit behavior, no-wait and status-only calls. A fake
clock verifies backoff, exact timeout, transient recovery and identity
mismatch without sleeping. Real API/PGlite integration and hosted CI
remain pending SP20; this source is not yet a completed SP21 row.
