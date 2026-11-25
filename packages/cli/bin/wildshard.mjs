#!/usr/bin/env node
// `wildshard` (SDK-SPLIT SP10, D4, Q34): the one command an author installs. It only dispatches (bin/route.mjs).
// - `build <source>` runs @wildshard/build's compiled bin (dist/build.mjs, from its prepack) straight away: no dev, no
//   engine, no vite. A built folder (`build <folder>` with a shard.json), recorded builds (`--input-receipt`) and
//   `--behaviour-only` stay on dev's CLI, which owns them; so does a checkout whose build is not compiled yet.
// - Every other verb, help and `--version` load dev's CLI (packages/dev/bin/wildshard.mjs) only when they run.
import { pathToFileURL } from 'node:url';
import { buildBin, inPackage } from './route.mjs';

const build = buildBin(process.argv.slice(2));
// SDK 0.5.0 plan M2: dev's bin refuses a verb while a migration is pending; `build` skips dev's bin, so ask here.
const gate = build === undefined ? undefined : await import(pathToFileURL(inPackage('@wildshard/dev', 'scripts/migration-gate.mjs')).href);
if (gate !== undefined && await gate.migrationGate(process.argv.slice(2), process.cwd())) process.exitCode = 1;
else {
  // Build's bin reads its operands from argv[2]; dev's bin reads the verb from argv[2] as before.
  if (build !== undefined) process.argv.splice(1, 2, build);
  await import(pathToFileURL(build ?? inPackage('@wildshard/dev', 'bin/wildshard.mjs')).href);
}
