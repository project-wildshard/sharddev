import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { clientPage } from '@wildshard/sdk/internal/clientPage';
import { preparationPreview } from '@wildshard/sdk/scripts/preparation-preview.mjs';
import { fetchPreparationClient, preparationClient } from '../src/sharddev/devClient.ts';
import { createDevWorld, DEV_RELEASE } from './dev-world.mjs';

const ENGINE = '@wildshard/engine';
const PROBE = `${ENGINE}/scripts/boot-memory-peak.mjs`;

function installedEngine() {
  const callerManifest = resolve('package.json');
  const caller = createRequire(callerManifest);
  const sdk = createRequire(import.meta.url);
  const callerEngine = existsSync(callerManifest) ? resolveEngine(caller) : undefined;
  const engine = callerEngine || sdk.resolve(`${ENGINE}/package.json`);
  const manifest = JSON.parse(readFileSync(engine, 'utf8'));
  const pin = callerEngine ? JSON.parse(readFileSync(callerManifest, 'utf8')).dependencies?.[ENGINE] ?? manifest.version : manifest.version;
  try {
    return { engine, pin, probe: (callerEngine ? caller : sdk).resolve(PROBE) };
  } catch (error) {
    throw new Error(`wildshard memory: engine ${pin} does not export the boot memory probe`, { cause: error });
  }
}

function resolveEngine(require) {
  try { return require.resolve(`${ENGINE}/package.json`); }
  catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    return undefined;
  }
}

async function memoryProduct(folder, out) {
  const { engine, pin, probe } = installedEngine();
  const { measureBootMemory, bootMemoryVerdict, bootMemoryLine } = await import(pathToFileURL(probe).href);
  const client = process.env.WILDSHARD_PREPARATION_CLIENT ? await preparationClient() : await fetchPreparationClient({ pin });
  const parent = resolve('tmp');
  mkdirSync(parent, { recursive: true });
  const scratch = mkdtempSync(resolve(parent, 'wildshard-memory-'));
  let preview;
  try {
    preview = await preparationPreview(client, folder, { clientPage, online: {
      releasePath: DEV_RELEASE, open: origin => createDevWorld(origin, scratch, engine),
    } });
    const run = await measureBootMemory({ url: preview.url, chunk: '' });
    const slug = preview.slug;
    if (!run.ready) throw new Error(`${slug} did not reach its world: ${run.failure ?? 'no error card'}`);
    if (run.boot !== 'online' || run.serverWorker !== false) throw new Error(`${slug}: engine ${pin} did not verify a worker-free online boot`);
    const verdict = bootMemoryVerdict(run.samples, run.dumps);
    const line = `${bootMemoryLine(slug, verdict)} · boot online`;
    if (out !== undefined) {
      const path = resolve(out);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify({ ...run, chunk: slug, engine: pin, dumps: Object.fromEntries(run.dumps), verdict, line }, null, 1)}\n`);
    }
    console.log(line);
    return verdict.pass ? 0 : 1;
  } finally {
    try { await preview?.close(); } finally { rmSync(scratch, { recursive: true, force: true }); }
  }
}

const [folder, output, ...extra] = process.argv.slice(2);
if (!folder || folder.startsWith('-') || extra.length > 0 || (output !== undefined && !/^--out=.+$/u.test(output))) {
  throw new Error('Usage: wildshard memory <folder> [--out=<report.json>]');
}
process.exitCode = await memoryProduct(folder, output?.slice('--out='.length));
