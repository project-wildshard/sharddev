import { runTickWorker } from '@wildshard/engine/host/tickWorkerLoop';

await runTickWorker(async ({ mode }) => {
  let tick = 0;
  const adapter = {
    step: () => { tick += 1; },
    commit: () => ({ tick, snapshot: 'initial', effects: [] }),
    finish: () => ({ ticks: tick, lanes: 0, steps: 0 }),
    dispose: () => { /* This adapter owns no resources outside its worker. */ },
  };
  if (mode === 'missing') return adapter;
  return { ...adapter, observe: () => ({
    tick: mode === 'order' ? 0 : tick,
    fuelUsed: mode === 'fuel' ? -1 : 0,
    scriptMicros: mode === 'time' ? Number.NaN : 0,
    effects: mode === 'effects'
      ? Array.from({ length: 1025 }, () => ({ kind: 'coins', amount: 1, actorId: 'fixture' }))
      : [],
  }) };
});
