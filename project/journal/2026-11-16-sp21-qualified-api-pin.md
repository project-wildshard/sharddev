# Qualify the complete guarded API contract

> Written by: Codex
> State: local SDK source checkpoint, 2026-11-16; released engine pin/hosted pending.

The async contract checkout now pins API main d0264bf9a4c963fad3900cc9f1d8bd8dc7f95a53,
which contains the deployed v0.20 protocol, rollout guards and release
merge-back. It replaces the partial SP18 contract. The fixture explicitly
enables staging and labels its exact contract source in diagnostics.

The SDK branch rebased onto published v0.3.6. Pin conflicts retained the
released engine 0.1.31/format 0.12 graph and upstream compiler tooling;
the lockfile was regenerated offline. All seven actual composed controls
pass in 37.54 seconds against API main and the immutable engine candidate:
placed/unplaced live, lost ACK recovery, real refusal, late refusal/stall
and packed CLI verdicts. No frozen/released engine proof is claimed yet:
0.1.31 lacks the new exports, so actual released engine delivery and the
SDK's hosted qualification still gate its single land and release.
