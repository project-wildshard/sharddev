# A latest SDK pins a final engine

Meta QA 11-25 row 139 (opus-rel86). sdk 0.7.0 went to npm `latest` with `@wildshard/dev` depending on engine
`0.1.93-next.4daadc70`, so `npm install @wildshard/cli` pulled an engine prerelease. `release-workspace.mjs pack` now
refuses, when `RELEASE_TAG` is set (only npm-publish.yml's tagged publish sets it), a final version whose packed
`dependencies` or `optionalDependencies` pin an engine prerelease. ci's packed install on main runs without it, so main
may keep its `next` engine pin and an SDK prerelease may carry one.

Engine v0.1.96 went to npm `latest` on 2026-11-26. Repinning the SDK to it is not a patch: engine 0.1.96 dropped
`legacySlot` from `MeleeProfile` (FORMAT-PRUNE), so `test/sdk-engine-types.test.ts` refuses the kit's profile until the
kit drops it too (opus-prune2's `plan/fp20` holds that hunk). A removed author field is a break (D29), so the repin
ships as the next minor with its migration.
