# Preserve the Warden fix beside M1 content

> Written by: Codex
> **State:** source rebase complete, 2026-11-16; actual engine pin and
> Opus hero recapture remain open.

Rebase M1 around sharddev main after219f23a's Warden reach correction.
Keep main's collision dimensions0.85/0.2/0.75 while retaining the kit boar
migration. Retain the exact four supplied hero/card files795e94c9e278,
rebased hero commit7dc5368. The combined source is3e8365b.

Full SDK types pass with the owned M1b engine source and actual format
0.11. The normal Template check refuses only hero-stale, as the Warden
content has changed since that M1 capture. No image is recaptured or
metadata restamped. Opus owns the visual capture after the actual engine
pin; the temporary engine source link is restored in finally.

The coordinator is cutting engine0.1.31. Verify it containsc7a984fa and
is npm-visible before pinning it. At13:46 it was not listed. Root and kit
remain aligned source labels0.3.5; no M1 package has been published.
