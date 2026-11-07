// oxlint-disable-next-line import/no-nodejs-modules -- Generation storage is a host-only filesystem capability.
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Content identities and private lease names never enter products.
import { createHash, randomUUID } from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- Cache paths contain only trusted roots and validated hashes.
import { basename, dirname, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Pruning runs as a low-priority background process on Mac and Linux.
import { spawn } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve this installed worker even when the CLI itself is bundled.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- The worker yields CPU priority to foreground builds.
import { setPriority } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Lock contention waits asynchronously, never busy-spins or recomputes a hit.
import { setTimeout as delay } from 'node:timers/promises';
// oxlint-disable-next-line import/no-nodejs-modules -- Native transactions release the shared cache mutex even after SIGKILL.
import { DatabaseSync } from 'node:sqlite';

const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const hash = /^[a-f0-9]{64}$/u;
const day = 86_400_000;
interface FileRow { name: string; hash: string; bytes: number }
export interface GenerationManifest { key: string; files: FileRow[] }
interface Lease { pid: number; keys: string[] }
interface Receipt { keys: string[]; project?: string }
interface Entry { path: string; key: string; job: string; used: number; blobs: string[] }

function live(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return !(error instanceof Error && 'code' in error && error.code === 'ESRCH'); }
}
function directories(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).filter(row => row.isDirectory() && !row.isSymbolicLink()).map(row => row.name);
}
function json(path: string, value: unknown): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, JSON.stringify(value), { flag: 'wx' }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}
function locked<T>(root: string, work: () => T): T | undefined {
  mkdirSync(root, { recursive: true });
  const database = new DatabaseSync(resolve(root, '.mutex.sqlite'), { timeout: 0 });
  try {
    try { database.exec('BEGIN IMMEDIATE'); }
    catch (error) {
      if (error instanceof Error && 'errcode' in error && (error.errcode === 5 || error.errcode === 6)) return undefined;
      throw error;
    }
    try { const value = work(); database.exec('COMMIT'); return value; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  } finally { database.close(); }
}
async function waitLocked<T>(root: string, work: () => T): Promise<T> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const result = locked(root, () => ({ value: work() }));
    if (result !== undefined) return result.value;
    if (Date.now() >= deadline) throw new Error('Generation cache lock held for 30 seconds');
    await delay(10);
  }
}

/** Versioned store: one immutable blob inode per SHA-256, index-only step keys.
 * Every cache operation and collector uses the same lock. A busy collector
 * yields briefly, preserving hits without a partially read build input.
 * Active leases survive until completion/process death; successful receipts
 * protect the current inputs even after the process exits. Legacy stores are
 * deliberately outside this namespace: their writers do not take our lock. */
export function generationCache(base: string, project: string, scope: string): {
  root: string;
  blobs: string;
  read: (step: string, key: string) => Promise<GenerationManifest | undefined>;
  populate: (step: string, manifest: GenerationManifest, files: ReadonlyMap<string, Uint8Array>) => Promise<boolean>;
  finish: (success: boolean) => Promise<void>;
} {
  const root = resolve(base, 'v3'), blobs = resolve(base, 'blobs'), projectName = basename(project);
  const leaseName = `${process.pid}-${randomUUID()}.json`, keys = new Set<string>();
  const receiptName = `${digest(`${project}\0${scope}`)}.json`;
  const pin = (key: string): void => {
    keys.add(key); mkdirSync(resolve(root, 'leases'), { recursive: true });
    json(resolve(root, 'leases', leaseName), { pid: process.pid, keys: [...keys] });
  };
  return {
    root,
    blobs,
    read(step, key) {
      return waitLocked(root, () => {
        pin(key);
        const path = resolve(root, 'keys', projectName, step, key);
        if (!existsSync(resolve(path, 'index.json'))) return undefined;
        const index = resolve(path, 'index.json');
        if (statSync(index).size > 1_000_000) throw new Error('Generation cache index exceeds byte cap');
        const saved = JSON.parse(readFileSync(index, 'utf8')) as GenerationManifest;
        const now = new Date(); utimesSync(path, now, now);
        return saved;
      });
    },
    populate(step, manifest, files) {
      return waitLocked(root, () => {
        pin(manifest.key);
        mkdirSync(blobs, { recursive: true });
        for (const bytes of files.values()) {
          const name = digest(bytes), target = resolve(blobs, name);
          if (existsSync(target)) {
            if (statSync(target).size !== bytes.byteLength) throw new Error('Generation cache byte mismatch');
            const saved = readFileSync(target);
            if (saved.byteLength !== bytes.byteLength || digest(saved) !== name) throw new Error('Generation cache byte mismatch');
            continue;
          }
          const temporary = `${target}.${randomUUID()}.tmp`;
          try {
            writeFileSync(temporary, bytes, { flag: 'wx' });
            // link is exclusive: even an unexpected concurrent writer cannot
            // replace an already published content address.
            linkSync(temporary, target);
          } finally { rmSync(temporary, { force: true }); }
        }
        const parent = resolve(root, 'keys', projectName, step), target = resolve(parent, manifest.key);
        mkdirSync(parent, { recursive: true });
        if (existsSync(target)) return false;
        const temporary = mkdtempSync(resolve(parent, '.writing-'));
        try { writeFileSync(resolve(temporary, 'index.json'), JSON.stringify(manifest), { flag: 'wx' }); renameSync(temporary, target); }
        finally { rmSync(temporary, { recursive: true, force: true }); }
        return true;
      });
    },
    finish(success) {
      return waitLocked(root, () => {
        if (success) {
          mkdirSync(resolve(root, 'receipts'), { recursive: true });
          json(resolve(root, 'receipts', receiptName), { project, keys: [...keys] });
        }
        rmSync(resolve(root, 'leases', leaseName), { force: true });
      });
    },
  };
}

/** G430: retain the three most recently used keys per job, expire older history
 * after a day, then evict LRU keys to 20 GB. Current receipts and live builds
 * always win over the limit. Blobs are swept only after every remaining index
 * is marked under the same lock; a partial/malformed census deletes nothing. */
export function pruneGenerationCache(root: string, options: { now?: number; maxBytes?: number; maxAgeMs?: number } = {}): { removed: number; bytes: number; protected: number } | undefined {
  return locked(root, () => {
    const now = options.now ?? Date.now(), maxBytes = options.maxBytes ?? 20_000_000_000;
    const protectedKeys = new Set<string>();
    for (const name of existsSync(resolve(root, 'leases')) ? readdirSync(resolve(root, 'leases')) : []) {
      if (!name.endsWith('.json')) continue;
      const path = resolve(root, 'leases', name), lease = JSON.parse(readFileSync(path, 'utf8')) as Lease;
      if (!Number.isSafeInteger(lease.pid) || lease.pid <= 0 || !Array.isArray(lease.keys) || lease.keys.some(key => typeof key !== 'string' || !hash.test(key))) throw new Error('Invalid generation lease');
      if (live(lease.pid)) for (const key of lease.keys) protectedKeys.add(key);
      else rmSync(path);
    }
    for (const name of existsSync(resolve(root, 'receipts')) ? readdirSync(resolve(root, 'receipts')) : []) {
      if (!hash.test(name.slice(0, -5)) || !name.endsWith('.json')) continue;
      const path = resolve(root, 'receipts', name);
      const receipt = JSON.parse(readFileSync(path, 'utf8')) as Receipt;
      if (!Array.isArray(receipt.keys) || receipt.keys.some(key => typeof key !== 'string' || !hash.test(key))) throw new Error('Invalid generation receipt');
      if (typeof receipt.project === 'string' && !existsSync(receipt.project)) { rmSync(path); continue; }
      for (const key of receipt.keys) protectedKeys.add(key);
    }
    const entries: Entry[] = [];
    for (const project of directories(resolve(root, 'keys'))) for (const step of directories(resolve(root, 'keys', project))) {
      for (const key of directories(resolve(root, 'keys', project, step))) {
        if (!hash.test(key)) continue;
        const path = resolve(root, 'keys', project, step, key);
        const manifest = JSON.parse(readFileSync(resolve(path, 'index.json'), 'utf8')) as GenerationManifest;
        if (manifest.key !== key || !Array.isArray(manifest.files) || manifest.files.some(row => !hash.test(row.hash))) throw new Error('Invalid generation index');
        entries.push({ path, key, job: `${project}/${step}`, used: statSync(path).mtimeMs, blobs: manifest.files.map(row => row.hash) });
      }
    }
    const blobs = resolve(root, '..', 'blobs'), blobSizes = new Map<string, number>(), legacyLinks = new Set<string>();
    for (const name of existsSync(blobs) ? readdirSync(blobs) : []) {
      if (!hash.test(name)) continue;
      const info = lstatSync(resolve(blobs, name));
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid generation blob');
      blobSizes.set(name, info.size);
      if (info.nlink > 1) legacyLinks.add(name);
    }
    const counts = new Map<string, number>();
    for (const entry of entries) for (const name of new Set(entry.blobs)) counts.set(name, (counts.get(name) ?? 0) + 1);
    let bytes = [...blobSizes.values()].reduce((sum, size) => sum + size, 0), removed = 0;
    const newest = new Map<string, number>(), candidates: Entry[] = [];
    for (const entry of entries.sort((a, b) => b.used - a.used || a.key.localeCompare(b.key))) {
      const rank = (newest.get(entry.job) ?? 0) + 1; newest.set(entry.job, rank);
      newest.set(entry.path, rank);
      if (!protectedKeys.has(entry.key)) candidates.push(entry);
    }
    for (const entry of candidates.reverse()) {
      if (bytes <= maxBytes && (newest.get(entry.path) ?? 0) <= 3 && now - entry.used <= (options.maxAgeMs ?? day)) continue;
      rmSync(entry.path, { recursive: true }); removed++;
      for (const name of new Set(entry.blobs)) {
        const count = (counts.get(name) ?? 0) - 1; counts.set(name, count);
        if (count === 0 && !legacyLinks.has(name)) { rmSync(resolve(blobs, name), { force: true }); bytes -= blobSizes.get(name) ?? 0; blobSizes.delete(name); }
      }
    }
    for (const [name, size] of blobSizes) if (!counts.has(name) && !legacyLinks.has(name)) { rmSync(resolve(blobs, name)); bytes -= size; }
    const result = { removed, bytes, protected: protectedKeys.size }; json(resolve(root, '.last-prune.json'), result); return result;
  });
}

/** Rate-limited detached worker: generation latency never includes a cache scan. */
export function maybePruneGenerationCache(root: string): void {
  const launch = locked(root, () => {
    const stamp = resolve(root, '.prune-stamp');
    if (existsSync(stamp) && Date.now() - statSync(stamp).mtimeMs < 600_000) return false;
    writeFileSync(stamp, ''); return true;
  });
  if (!launch) return;
  const entry = createRequire(resolve(import.meta.dirname, 'package.json')).resolve('@wildshard/sharddev/projectGeneration');
  const worker = spawn(process.execPath, [resolve(dirname(entry), 'generationCache.ts'), '--prune-generation-cache', root], { detached: true, stdio: 'ignore' });
  worker.on('error', () => undefined); worker.unref();
}

if (process.argv[2] === '--prune-generation-cache') {
  setPriority(19);
  const root = process.argv[3];
  if (root === undefined) throw new Error('Generation cache worker needs a root');
  pruneGenerationCache(root);
}
