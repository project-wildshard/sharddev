// oxlint-disable-next-line import/no-nodejs-modules -- Own bounded project and output fixtures under repository tmp.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only owned fixture paths.
import { resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { runCli } from './cli';
import { checkProject } from './checkProject';
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

// SDK-SPLIT SP7c (D3): build and validate run no simulation; `wildshard check` (dev) runs the engine's own full check,
// the cook's (SP19), which measures script CPU again and refuses a fresh over-budget observation despite a stale receipt.
test('build and validate run no simulation; check measures CPU again and refuses fresh over-budget observations', async () => {
  mkdirSync('tmp', { recursive: true });
  const scratch = mkdtempSync(resolve('tmp', 'cli-cpu-'));
  const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const start = HeadlessSimulation.create.bind(HeadlessSimulation);
  let created = 0, ticks = 0, overBudget = false;
  const measured = vi.spyOn(HeadlessSimulation, 'create').mockImplementation(async (...args) => {
    const sim = await start(...args), validate = sim.validate.bind(sim);
    created++;
    // Craft a bad fresh measurement at the trusted worker boundary; all actual physics/tick execution still runs.
    vi.spyOn(sim, 'validate').mockImplementation(async () => {
      const report = await validate(); ticks += report.observation.samples.length;
      if (overBudget) for (const row of report.observation.samples) row.scriptMicros = 5000;
      return report;
    });
    return sim;
  });
  try {
    const project = resolve(scratch, 'project'), output = resolve(scratch, 'out');
    newProject(project, 'cli-cpu');
    await runCli(['build', project, output, '--folder-only', '--no-placeholders']);
    // The static half of the performance report still runs (and can refuse) at build and at both validates.
    const reports = () => log.mock.calls.filter(args => typeof args[0] === 'string' && args[0].startsWith('PERFORMANCE REPORT')).length;
    expect(reports()).toBe(1);
    writeFileSync(resolve(output, 'validation.json'), JSON.stringify({ scripts: { p95Micros: 0, maxMicros: 0, samples: 1000000 } }));
    await expect(runCli(['validate', output])).resolves.toBeUndefined();
    await expect(runCli(['validate', project])).resolves.toBeUndefined();
    expect(reports()).toBe(3);
    expect(created).toBe(0);
    // The numbers validate used to print are check's report note now (SP7c).
    const passed = await checkProject(project, resolve(scratch, 'first-check'));
    expect(passed.steps.find(step => step.name === 'report')?.note).toMatch(/\d+ sim ticks, \d+ edge lanes, \d+ capsule steps/u);
    expect(log.mock.calls.some(args => args.some(value => typeof value === 'string' && value.includes('wildshard check')))).toBe(true);
    overBudget = true;
    const checked = await checkProject(project, resolve(scratch, 'checked'));
    expect(ticks).toBeGreaterThan(0);
    expect(checked.verdict).toBe('fail');
    expect(checked.steps.find(step => step.name === 'report')?.status).toBe('fail');
  } finally { measured.mockRestore(); log.mockRestore(); rmSync(scratch, { recursive: true, force: true }); }
});
