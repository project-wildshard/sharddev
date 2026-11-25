# The packages' Node range gets its upper bound

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25

The R3 trial of `wildshard upgrade 0.5.0` in shard-showcase went red
on the repo's own `pnpm check`: its node-engines test refused
`engines.node ">=24.18.0"`. The upgrade wrote that. It moves a repo's
`engines.node` to the sdk's (`updatePins.ts`), and the five packages
still said `>=24.18.0` after 302ede7c gave the root `<25` (hosted
runners resolve the open range to Node 26, which refuses
`--experimental-transform-types`).

- cli, sdk, dev, build and upload say `>=24.18.0 <25`; kit names none.
- `test/tooling/package-engines.test.mjs` (in `pnpm check`) holds each
  package's range to the root's, and requires the sdk to name one.
- It ships as 0.5.1, a patch: no repo has to change. The R3 roll goes
  to 0.5.1, so no repo ever lands the open range.
