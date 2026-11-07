// oxlint-disable-next-line import/no-nodejs-modules -- Owned child-process diagnostic fixture.
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Owned fixture paths.
import {resolve as resolvePath} from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { runShardBuild, runShardBuildPool } from '../scripts/shard-build-pool.mjs';

const owned: string[] = [];
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const root of owned.splice(0)) rmSync(root,{recursive:true,force:true});
});

test('bounds active builds at six and drains every product', async () => {
  vi.useFakeTimers();
  let active = 0, peak = 0;
  const completed: number[] = [];
  const builds = runShardBuildPool(Array.from({ length: 14 }, (_, i) => i), async item => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => { setTimeout(resolve, 10); });
    completed.push(item); active--;
  });
  expect(active).toBe(6);
  await vi.advanceTimersByTimeAsync(30);
  await builds;
  expect(peak).toBe(6); expect(active).toBe(0);
  expect(completed.sort((a,b) => a-b)).toEqual(Array.from({ length: 14 }, (_, i) => i));
});

test('aborts owned builds, starts no queued work and drains failures', async () => {
  vi.useFakeTimers();
  const started: number[] = [], aborted: number[] = [];
  let active = 0;
  const builds = runShardBuildPool(Array.from({ length: 10 }, (_, i) => i), async (item, signal) => {
    started.push(item); active++;
    signal.addEventListener('abort', () => { aborted.push(item); }, { once: true });
    try {
      await new Promise(resolve => { setTimeout(resolve, item === 0 ? 1 : 20); });
      if (item === 0) throw new Error('Bad authored product');
    } finally { active--; }
  });
  const refusal = expect(builds).rejects.toThrow('Bad authored product');
  await vi.advanceTimersByTimeAsync(20);
  await refusal;
  expect(started).toEqual([0,1,2,3,4,5]);
  expect(aborted).toEqual(started); expect(active).toBe(0);
});

test('retains a bounded failing child stderr tail with its product identity', async () => {
  mkdirSync('tmp',{recursive:true});
  const root=mkdtempSync(resolvePath('tmp/shard-pool-diagnostics-')); owned.push(root);
  const hook=resolvePath(root,'child.mjs');
  // Replace only author work; exercise the real spawn, stderr and exit path.
  const source=String.raw`process.stderr.write('discarded prefix'+ 'x'.repeat(9000)+'\nNative fixture refusal\n');process.exitCode=1;`;
  writeFileSync(hook,`import {registerHooks} from 'node:module';registerHooks({load(url,context,next){if(url.endsWith('/scripts/wildshard.mjs'))return {format:'module',shortCircuit:true,source:${JSON.stringify(source)}};return next(url,context);}});`);
  vi.stubEnv('NODE_OPTIONS',`${process.env['NODE_OPTIONS']??''} --import ${hook}`);
  const forwarded=vi.spyOn(process.stderr,'write').mockImplementation(()=>true);
  let failure: unknown;
  try { await runShardBuild(['build','fixture/project','fixture/out'],new AbortController().signal); }
  catch (error) { failure=error; }
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('Missing child failure');
  expect(failure.message).toContain('Shard build exited 1 (fixture/project)');
  expect(failure.message).toContain('Native fixture refusal');
  expect(failure.message).not.toContain('discarded prefix');
  expect(failure.message.length).toBeLessThan(8500);
  expect(forwarded.mock.calls.map(call=>String(call[0])).join('')).toContain('discarded prefix');
});

test('real child transport aggregates one bounded cache report and preserves stderr and status', async () => {
  mkdirSync('tmp',{recursive:true});
  const root=mkdtempSync(resolvePath('tmp/shard-pool-cache-'));owned.push(root);
  const hook=resolvePath(root,'child.mjs');
  const {createBuildCacheCounters,formatBuildCacheReport}=await import('../scripts/build-cache-report.mjs');
  const counters=createBuildCacheCounters();
  counters.record({version:1,cache:'zstd-bytes',event:'lookup',bytes:0});
  counters.record({version:1,cache:'zstd-bytes',event:'disk-hit',bytes:17});
  const report=formatBuildCacheReport(counters.snapshot(true));
  const source=`process.stderr.write('before without newline');process.stderr.write('\\n'+${JSON.stringify(report.slice(0,31))});process.stderr.write(${JSON.stringify(report.slice(31))}+'\\nafter\\n');`;
  writeFileSync(hook,`import {registerHooks} from 'node:module';registerHooks({load(url,context,next){if(url.endsWith('/scripts/wildshard.mjs'))return {format:'module',shortCircuit:true,source:${JSON.stringify(source)}};return next(url,context);}});`);
  vi.stubEnv('NODE_OPTIONS',`${process.env['NODE_OPTIONS']??''} --import ${hook}`);
  const forwarded=vi.spyOn(process.stderr,'write').mockImplementation(()=>true),parent=createBuildCacheCounters();
  await runShardBuild(['build','fixture/project','fixture/out'],new AbortController().signal,reading=>{parent.merge(reading);});
  expect(forwarded.mock.calls.map(call=>String(call[0])).join('')).toBe('before without newline\nafter\n');
  expect(parent.snapshot(true).complete).toBe(true);
  expect(parent.snapshot(true).caches.find(row=>row.cache==='zstd-bytes')).toMatchObject({hits:1,bytesReused:17});
});
