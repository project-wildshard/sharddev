// oxlint-disable-next-line import/no-nodejs-modules -- The fixed adversarial worker is repository-owned.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Source workers share the normal strict native loader.
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { emptyShardfile } from '@wildshard/engine/host/author';
import { HeadlessSimulation } from '@wildshard/engine/host/headless';
import { TickWorkerHost } from '@wildshard/engine/host/tickWorkerHost';
import { OBSERVATION_TICKS } from '@wildshard/engine/host/headlessObservation';
import type { HeadlessTapeSegment } from '@wildshard/engine/host/headlessTape';

test('terminal observation retains every real step and the complete native final continuation', async () => {
  const source = emptyShardfile({ slug: 'observation', name: 'Observation', author: 'Fixture', revision: 1, seed: 417 });
  const sim = await HeadlessSimulation.create(source, new Map(), undefined, { deadline: 'advisory' });
  const control = await HeadlessSimulation.create(source, new Map(), undefined, { deadline: 'advisory' });
  try {
    const report = await sim.observe();
    let expected = control.checkpoint;
    for (let tick = 0; tick < OBSERVATION_TICKS; tick++) expected = await control.step();
    expect(report.samples.map(row => row.tick)).toEqual(Array.from({ length: OBSERVATION_TICKS }, (_, index) => index + 1));
    expect(report.samples.every(row => Number.isFinite(row.tickMicros) && row.tickMicros >= 0 && row.scriptMicros >= 0 && row.fuelUsed >= 0)).toBe(true);
    expect(report.commit.snapshot).toBe(expected?.snapshot);
    expect(report.commit.effects).toEqual(expected?.effects);
    expect(sim.checkpoint?.snapshot).toBe(report.commit.snapshot);
    report.commit.snapshot = 'caller edit';
    expect(sim.checkpoint?.snapshot).toBe(expected?.snapshot);
    const restored = await HeadlessSimulation.create(source, new Map(), sim.checkpoint?.snapshot, { deadline: 'advisory' });
    try { expect((await restored.step()).snapshot).toBe((await control.step()).snapshot); }
    finally { await restored.dispose(); }
    await expect(sim.step()).rejects.toThrow('finished');
    await expect(sim.observe()).rejects.toThrow('finished');
    expect(sim.quarantined).toBe(false);
  } finally { await sim.dispose(); await control.dispose(); }
  await expect(sim.observe()).rejects.toThrow();
});

test('runtime owners cannot request an offline observation or lose their checkpoint on refusal', async () => {
  const source = emptyShardfile({ slug: 'live-observation', name: 'Live observation', author: 'Fixture', revision: 1, seed: 17 });
  const sim = await HeadlessSimulation.create(source, new Map());
  try {
    const before = sim.checkpoint;
    await expect(sim.observe()).rejects.toThrow('trusted offline');
    expect(sim.checkpoint).toEqual(before);
  } finally { await sim.dispose(); }
});

test('an observation queued at initialization cannot take an active stream owner', async () => {
  const host = new TickWorkerHost(pathToFileURL(resolve('test/fixtures/headless/observation-worker.mjs')), { mode: 'fuel' },
    { tickMicros: 1000, commandsPerTick: 1 }, ['--experimental-transform-types', '--import', pathToFileURL(resolve('scripts/sim-node-loader.mjs')).href], 'advisory');
  let release: (() => void) | undefined;
  const gate = new Promise<void>(_resolve => { release = _resolve; });
  async function* parts(): AsyncGenerator<HeadlessTapeSegment> { await gate; yield { id: 'ownership', ticks: 1, commands: [] }; }
  const stream = (async () => { try { await host.streamVerbTape([], parts()); return 'unexpected success'; } catch (error) { return error; } })();
  const observing = host.observe();
  try {
    await expect(observing).rejects.toThrow('busy');
    release?.();
    expect(await stream).toBeInstanceOf(Error);
  } finally { release?.(); await host.dispose(); }
});

test.each(['missing', 'fuel', 'time', 'effects', 'order'])('bad %s observations quarantine without publishing a partial continuation', async mode => {
  const host = new TickWorkerHost(pathToFileURL(resolve('test/fixtures/headless/observation-worker.mjs')), { mode },
    { tickMicros: 1000, commandsPerTick: 1 }, ['--experimental-transform-types', '--import', pathToFileURL(resolve('scripts/sim-node-loader.mjs')).href], 'advisory');
  try {
    await host.initialized(); const before = host.checkpoint;
    await expect(host.observe()).rejects.toThrow();
    expect(host.quarantined).toBe(true);
    expect(host.checkpoint).toEqual(before);
    await expect(host.step()).rejects.toThrow();
  } finally { await host.dispose(); }
});
