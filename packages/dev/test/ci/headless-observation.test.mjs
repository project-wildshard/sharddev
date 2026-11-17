// J186: installed public owner APIs and real isolated worker continuations.
// Register the engine loader with --import before static dependencies load.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { emptyShardfile } from '@wildshard/sdk/author';
import { HeadlessSimulation } from '@wildshard/engine/host/headless';
import { OBSERVATION_TICKS } from '@wildshard/engine/host/headlessObservation';
import { TickWorkerHost } from '@wildshard/engine/host/tickWorkerHost';

const require = createRequire(import.meta.url);
const loader = pathToFileURL(require.resolve('@wildshard/engine/scripts/sim-node-loader.mjs')).href;
const source = emptyShardfile({ slug: 'observation', name: 'Observation', author: 'Outside author', revision: 1, seed: 417 });
const options = { timeout: 9500 };

function host(mode) {
  return new TickWorkerHost(new URL('./fixtures/observation-worker.mjs', import.meta.url), { mode },
    { tickMicros: 1000, commandsPerTick: 1 }, ['--experimental-transform-types', '--import', loader], 'advisory');
}

test('offline observation retains every real step and an isolated restored continuation', options, async () => {
  const sim = await HeadlessSimulation.create(source, new Map(), undefined, { deadline: 'advisory' });
  let control;
  try {
    control = await HeadlessSimulation.create(source, new Map(), undefined, { deadline: 'advisory' });
    const report = await sim.observe();
    let expected = control.checkpoint;
    for (let tick = 0; tick < OBSERVATION_TICKS; tick++) expected = await control.step();
    assert.deepEqual(report.samples.map(row => row.tick), Array.from({ length: OBSERVATION_TICKS }, (_, index) => index + 1));
    assert.ok(report.samples.every(row => Number.isFinite(row.tickMicros) && row.tickMicros >= 0 && row.scriptMicros >= 0 && row.fuelUsed >= 0));
    assert.equal(report.commit.snapshot, expected?.snapshot);
    assert.deepEqual(report.commit.effects, expected?.effects);
    assert.equal(sim.checkpoint?.snapshot, report.commit.snapshot);
    report.commit.snapshot = 'caller edit';
    assert.equal(sim.checkpoint?.snapshot, expected?.snapshot);
    const restored = await HeadlessSimulation.create(source, new Map(), sim.checkpoint?.snapshot, { deadline: 'advisory' });
    try { assert.equal((await restored.step()).snapshot, (await control.step()).snapshot); }
    finally { await restored.dispose(); }
    await assert.rejects(sim.step(), /finished/);
    await assert.rejects(sim.observe(), /finished/);
    assert.equal(sim.quarantined, false);
  } finally { await sim.dispose(); await control?.dispose(); }
  await assert.rejects(sim.observe());
});

test('runtime owners refuse offline observation without changing their checkpoint', options, async () => {
  const sim = await HeadlessSimulation.create(source, new Map());
  try {
    const before = sim.checkpoint;
    await assert.rejects(sim.observe(), /trusted offline/);
    assert.deepEqual(sim.checkpoint, before);
  } finally { await sim.dispose(); }
});

test('an observation queued at initialization cannot take an active stream owner', options, async () => {
  const worker = host('fuel');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  async function* parts() { await gate; yield { id: 'ownership', ticks: 1, commands: [] }; }
  const stream = worker.streamVerbTape([], parts()).then(() => { throw new Error('Unexpected stream success'); }, error => error);
  const observing = worker.observe();
  try {
    await assert.rejects(observing, /busy/);
    assert.equal(worker.quarantined, false);
    release();
    const failure = await stream;
    assert.ok(failure instanceof Error);
    assert.match(failure.message, /Missing native verb tape capability/u);
  } finally { release(); await worker.dispose(); }
});

test('the healthy real worker adapter completes the same observation protocol', options, async () => {
  const worker = host('healthy');
  try {
    await worker.initialized();
    const report = await worker.observe();
    assert.equal(report.samples.length, OBSERVATION_TICKS);
    assert.equal(report.commit.tick, OBSERVATION_TICKS);
    assert.equal(worker.quarantined, false);
  } finally { await worker.dispose(); }
});

const refusals = {
  missing: /Missing offline observation capability/u,
  fuel: /Expected >=0 but received -1/u,
  time: /received NaN/u,
  effects: /Expected <=1024 but received 1025/u,
  order: /Observation ticks must be complete and ordered/u,
};
for (const [mode, reason] of Object.entries(refusals)) {
  test(`bad ${mode} observation quarantines without publishing partial continuation`, options, async () => {
    const worker = host(mode);
    try {
      await worker.initialized();
      const before = worker.checkpoint;
      await assert.rejects(worker.observe(), reason);
      assert.equal(worker.quarantined, true);
      assert.deepEqual(worker.checkpoint, before);
      await assert.rejects(worker.step());
    } finally { await worker.dispose(); }
  });
}
