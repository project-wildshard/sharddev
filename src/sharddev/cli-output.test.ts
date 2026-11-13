// oxlint-disable-next-line import/no-nodejs-modules -- Own bounded project and output fixtures under repository tmp.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only owned fixture paths.
import { resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { runCli } from './cli';
import { buildProject, newProject } from '@wildshard/sdk/project';
import { encodeCanonicalJson } from './immutable';
import { HeadlessSimulation } from '@wildshard/engine/host/headless';

test('CLI validates v2 output and refuses monolith disk inputs for validate and prove', async () => {
  mkdirSync('tmp', { recursive: true });
  const scratch = mkdtempSync(resolve('tmp', 'cli-output-')), log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  try {
    const project = resolve(scratch, 'project'), output = resolve(scratch, 'out'), old = resolve(scratch, 'old');
    newProject(project, 'cli-output');
    const source = await buildProject(project, output, { client: null, placeholders: false });
    await expect(runCli(['validate', output])).resolves.toBeUndefined();
    await expect(runCli(['validate', resolve(output, 'shard.json')])).resolves.toBeUndefined();
    await expect(runCli(['validate', resolve(output, 'other.json')])).rejects.toThrow('format-2 shard.json');
    mkdirSync(old);
    writeFileSync(resolve(old, 'shard.json'), encodeCanonicalJson(source));
    await expect(runCli(['validate', old])).rejects.toThrow(/format/u);
    await expect(runCli(['prove', resolve(old, 'shard.json'), resolve(scratch, 'absent-proof.json')])).rejects.toThrow(/format/u);
  } finally { log.mockRestore(); rmSync(scratch, { recursive: true, force: true }); }
});

test('built admission measures CPU again and refuses fresh over-budget observations despite a stale receipt', async () => {
  mkdirSync('tmp', { recursive: true });
  const scratch = mkdtempSync(resolve('tmp', 'cli-cpu-'));
  const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  try {
    const project = resolve(scratch, 'project'), output = resolve(scratch, 'out');
    newProject(project, 'cli-cpu');
    await buildProject(project, output, { client: null, placeholders: false });
    writeFileSync(resolve(output, 'validation.json'), JSON.stringify({ scripts: { p95Micros: 0, maxMicros: 0, samples: 1000000 } }));
    await expect(runCli(['validate', output])).resolves.toBeUndefined();
    expect(log.mock.calls.some(args => args.some(value => typeof value === 'string' && value.includes('measured scripts (180 ticks)')))).toBe(true);
    const start = HeadlessSimulation.create.bind(HeadlessSimulation);
    let ticks = 0;
    // Craft a bad fresh measurement at the trusted worker boundary; all actual
    // physics/tick execution still runs. The disk receipt still claims zero CPU.
    const measured = vi.spyOn(HeadlessSimulation, 'create').mockImplementation(async (...args) => {
      const sim = await start(...args), observe = sim.observe.bind(sim);
      vi.spyOn(sim, 'observe').mockImplementation(async () => {
        const report = await observe(); ticks += report.samples.length;
        for (const row of report.samples) row.scriptMicros = 5000;
        return report;
      });
      return sim;
    });
    try {
      await expect(runCli(['validate', output])).rejects.toThrow('Performance report refused');
      expect(ticks).toBe(240);
      expect(log.mock.calls.some(args => args.some(value => typeof value === 'string' && value.includes('script CPU p95 us/tick: 5000')))).toBe(true);
    } finally { measured.mockRestore(); }
  } finally { log.mockRestore(); rmSync(scratch, { recursive: true, force: true }); }
});
