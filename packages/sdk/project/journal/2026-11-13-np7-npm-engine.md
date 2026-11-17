# The sdk takes engine and format from npm (NPM-PUBLISH NP7)

> Written by: Claude (buddy-repos)

- `@wildshard/engine@0.1.17` is on npm (published by engine's npm-publish
  with provenance, 2026-11-13; the registry showed it about 8 minutes after
  the job). `dependencies` now pin `@wildshard/engine` `0.1.17` and
  `@wildshard/format` `npm:@wildshard/shard-format@0.4.9`, and
  `pnpm.overrides` names the same format. No git spec is left in
  `dependencies` or `overrides`.
- Exact, not `^`: the NP7 row says `^<NP6 version>`, but its own SA8 note
  and `newProject-repo.test.ts` want every pin a new shard repo copies from
  the sdk to be exact; a `^0.1.17` failed that test. Exact also keeps
  `wildshard dev` fetching the client of the engine that is installed.
- `pnpm-workspace.yaml` drops the `@wildshard/engine` `packageExtensions`:
  engine 0.1.17 declares vite, sharp, `@typescript/typescript6` and an
  optional `@types/three` as peers, and the sdk depends on all four.
- The sdk release that ships this, and the outside-author proof against the
  registry (`npm install @wildshard/sdk`, `new`, `build`, `validate`), follow.
- It is an engine upgrade too: the old commit pin `d10f30e` was 0.1.16;
  0.1.17 adds eight commits (bots frame inter-arrival, grounded Y-only gap,
  heavy-lane lease reaping, PWA music precache, tests, the release).
  `pnpm check` is green against it.
- Follow-up (review): engine depends on `npm:@wildshard/shard-format@^0.4.9`
  while the sdk pins `0.4.9`; the sdk's override only binds this repo. Once
  0.4.10 is out, an author's install could hold two formats. Engine pinning
  format exactly (or the sdk taking `^`) closes it.
