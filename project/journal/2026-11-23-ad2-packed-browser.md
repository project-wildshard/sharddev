# Packed browser cases pass the Name prompt (AD2)

mini-ad2, 2026-11-23. `ring-2-author.yml`'s packed browser step failed every run since 11-20: engine MP2.4's Name prompt
held the play cases until the 80 s deadline (only explore skipped it). Behind it, the dev client's expected
`/code-retention.json` 404, a non-fatal `boot.slow` report on software rendering and npm `next` engine pins tripped the
proof. All three are now told apart from real faults, and the step has 8 minutes for its three cases.
