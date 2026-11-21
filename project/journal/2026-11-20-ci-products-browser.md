# Give the SDK browser proof a separate runner

The v0.4.22 release run 44846541790 hit the Products job's
15-minute cap twice. Attempt 2 passed the 1,800-tick Mossgate route
and ran out of time during browser E2E, before the memory reading.
E2E builds and serves its own workspace and reads no Products output.

Run E2E alongside Products under the same job caps. The pinned or
candidate dependency setup, all product and browser commands, and
both retained artifact paths stay in the same workflow. Both matrix
jobs must finish green to qualify the exact release commit.
