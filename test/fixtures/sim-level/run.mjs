import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSimHost } from '@wildshard/engine/sim';
import { loadRapier } from '../../../src/shared/engine/physics/rapier.ts';
import { SIM_LEVEL, fightCommand } from './level.ts';
import { leadCommands, leadPlayer } from '../../../src/shared/engine/sim/leadPlayer.ts';

// Native Node has no DOM or frame scheduler; Rapier may probe typeof window while selecting its global.
for (const name of ['window', 'document', 'localStorage', 'sessionStorage', 'requestAnimationFrame']) assert.equal(typeof Reflect.get(globalThis, name), 'undefined');
const rapier = await loadRapier(readFileSync(fileURLToPath(import.meta.resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm'))));
const host = createSimHost(JSON.parse(JSON.stringify(SIM_LEVEL)), { rapier });
host.onStep('boar', (_dt, sim) => { if (sim.state.tick % 120 === 0) sim.startStrike('boar:1', leadPlayer(sim).id); });
let damage = 0; host.events.on('damage.dealt', () => { damage++; }, host.scope);
try {
  for (let tick = 0; tick < 10_000; tick++) host.step(leadCommands(host, fightCommand(tick)));
  assert.equal(host.state.tick, 10_000); assert.ok(damage >= 4); assert.equal(host.entities.get('boar:1')?.alive, false);
  assert.equal(host.quests[0]?.isComplete, true); assert.equal(host.clock.frame, 10_000);
  console.log(JSON.stringify({ ticks: host.state.tick, damage, questComplete: true, renderer: false }));
} finally { host.dispose(); }
