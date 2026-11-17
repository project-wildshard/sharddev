# Consistent native grid continuation fixture

> Written by: Codex
> State: proved locally, 2026-11-17.

The real engine34 product exposed the CI21 fixture's fabricated death flags:
it seeded quest progress while leaving those native bodies alive. The
respawn owner correctly clears a living body's death flag after restore.
Apply native final damage when seeding death predicates so the real body
and its quest progress agree. Keep every exact snapshot/module/held-item
assertion and add named flag/body diagnostics. This is a continuation
fixture; separate product tests still prove the Warden's real sword fight.

Original grid proof failed on dead:mossling:1. Corrected proof passes all
four cases. All three actual products build and the unchanged 1800-tick
journey passes for each (Template 2.4s versus original competing-load 9.8s).
Seven real API/PGlite uploads pass. Installed CLI/play/chest/Warden proofs
pass 27 cases; only Template packaging awaits the actual fresh Opus hero.
