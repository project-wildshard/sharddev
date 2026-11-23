// SHARD-COMPAT SI4: the headless harness a shard's tests, scripts and ci reach through the sdk, never `@wildshard/engine` by name.
// `@wildshard/sdk/headless/<path>` is `@wildshard/engine/<path>` for each harness path a shard uses (the census's SI5 rows): the host
// and its runtime, the Node simulation loader (`@wildshard/sdk/headless/scripts/sim-node-loader.mjs`), the product readers and the
// bake scripts. The engine is the shard's own: a peer of the sdk, so these files resolve the version the shard pins. This entry
// names that engine: where it is installed, its version (the pin) and a require from its folder, for the lines that read
// `@wildshard/engine/package.json` today. Plain JS with Node built-ins only: it loads before any type-stripping hook.
// oxlint-disable-next-line import/no-nodejs-modules -- Read the engine's package.json, as Node finds it.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the engine from the sdk, as its peer.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- The engine's folder.
import { dirname } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- The engine's package.json as a URL.
import { pathToFileURL } from 'node:url';

/** The engine's `package.json`, as the sdk resolves its peer (the shard's own engine). */
export const enginePackagePath = createRequire(import.meta.url).resolve('@wildshard/engine/package.json');
/** `enginePackagePath` as a URL, for `createRequire` and `new URL` callers. */
export const enginePackageUrl = pathToFileURL(enginePackagePath).href;
/** The engine's installed folder. */
export const engineRoot = dirname(enginePackagePath);
/** The engine's version: the pin this shard runs on. */
export const enginePin = /** @type {{ version: string }} */ (JSON.parse(readFileSync(enginePackagePath, 'utf8'))).version;
/** A require from the engine's folder: what `createRequire(import.meta.resolve('@wildshard/engine/package.json'))` gave. */
export const engineRequire = createRequire(enginePackagePath);
