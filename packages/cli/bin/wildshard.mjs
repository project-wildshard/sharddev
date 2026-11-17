#!/usr/bin/env node
// `wildshard` (SDK-SPLIT SP10, D4, Q34): the one command an author installs. It only dispatches (bin/route.mjs).
// - `build <source>` runs @wildshard/build's compiled bin (dist/build.mjs, from its prepack) straight away: no dev, no
//   engine, no vite. A built folder (`build <folder>` with a shard.json), recorded builds (`--input-receipt`) and
//   `--behaviour-only` stay on dev's CLI, which owns them; so does a checkout whose build is not compiled yet.
// - Every other verb, help and `--version` load dev's CLI (packages/dev/bin/wildshard.mjs) only when they run.
import { pathToFileURL } from 'node:url';
import { buildBin, route } from './route.mjs';

const args = process.argv.slice(2);
const script = route(args);
// Build's bin reads its operands from argv[2]; dev's bin reads the verb from argv[2] as before.
if (buildBin(args) !== undefined) process.argv.splice(1, 2, script);
await import(pathToFileURL(script).href);
