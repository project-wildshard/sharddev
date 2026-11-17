// oxlint-disable-next-line import/no-nodejs-modules -- Rapier is a shipped binary.
import { readFileSync } from 'node:fs';
import { beforeAll, expect, test, vi, type Mock } from 'vitest';
import { BitWriter } from '../src/shared/engine/net/bits';
import { NET_SCHEMA_HASH } from '../src/shared/engine/net/netSchemas';
import { decodeAct, encodeAct } from '../src/shared/engine/net/messages';
import { actRoutes } from '../src/shared/engine/sim/actRoutes';
import { DAY_ROW, publishDay, shardRows } from '../src/shared/engine/sim/shardRows';
import { DEFAULT_NORMALIZED_DAY, normalizedDayClock } from '../src/shared/engine/world/dayCycle';
import { WirePage } from '../src/client/game/shardfile/wirePage';
import { NetClient } from '../src/client/engine/net/client';
import { netClimate } from '../src/client/game/weather/netClimate';
import { installDeclaredClimate } from '../src/server/game/shardfile/declaredClimate';
import { publishWeather } from '../src/server/game/weather/wire';
import { netWorldInput } from '../src/sdk/standalone/netInput';
import type { Transport } from '../src/shared/engine/net/transport';
import { createSimHost, type SimHost } from '../src/server/engine/sim';
import { loadRapier, type Rapier } from '../src/shared/engine/physics/rapier';
import { SIM_LEVEL } from './fixtures/sim-level/level';
import { parseRows } from '@wildshard/format/rows';
import { parseWeatherProgram } from '@wildshard/format/weatherProgram';

// Flip checklist 5 and 6: a data shard's day and weather step on the server and reach the page as rows, and a page's weather
// setting and a dev's jump reach that sky as an act.
const act = { kind: 'climate', seq: 3, op: 'force', name: 'storm', at: 0.5 } as const;
test('a word on the sky survives the wire, and the schema hash names its form', () => {
  expect(decodeAct(new Uint8Array(encodeAct(new BitWriter(), act)))).toEqual(act);
  expect(NET_SCHEMA_HASH).toBeTypeOf('number');
});

let rapier: Rapier;
beforeAll(async () => { rapier = await loadRapier(readFileSync('public/assets/physics/rapier.wasm')); });
const fakeHost = (): SimHost => createSimHost(SIM_LEVEL, { rapier });
const sky = (): Omit<Parameters<typeof publishWeather>[1], 'setMode' | 'force'> & { setMode: Mock<(mode: string, at?: number) => void>; force: Mock<(state: string, at?: number) => void> } => ({ n: { overcast: 0, rain: 0, wet: 0, wind: 0, fog: 0 }, state: 'clear', phaseLeft: 3, profile: { states: ['clear', 'storm'], modes: { live: 'none' } }, setMode: vi.fn(), force: vi.fn() });

test('a page back from a room gives a lone player\'s day back to the server, and not a room\'s or a frozen one', () => {
  const said = { kind: 'climate', seq: 4, op: 'day', name: 'room', at: 0.75 } as const;
  expect(decodeAct(new Uint8Array(encodeAct(new BitWriter(), said)))).toEqual(said);
  const host = fakeHost(), clock = host.useDayClock(normalizedDayClock(DEFAULT_NORMALIZED_DAY, null)), input = [{ acts: [said], command: null }];
  netWorldInput(actRoutes(host), input); expect(clock.phase).toBe(0.75);
  clock.phase = 0.25; clock.paused = true;
  netWorldInput(actRoutes(host), input); expect(clock.phase, 'a Developer\'s frozen time holds').toBe(0.25);
  clock.paused = false; host.addPlayer('bot:1', { x: 3, y: 0, z: 3 });
  netWorldInput(actRoutes(host), input); expect(clock.phase, 'a room shares one day').toBe(0.25);
  host.dispose();
});

test('a lone player\'s word lands on their sky, a known word only, and a room\'s sky hears no one', () => {
  const host = fakeHost(), air = sky(), input = (word: Omit<typeof act, 'kind' | 'seq' | 'op' | 'name' | 'at'> & { readonly op: 'mode' | 'force'; readonly name: string; readonly at: number }): { command: null; acts: readonly { kind: 'climate'; seq: number; op: 'mode' | 'force'; name: string; at: number }[] } => ({ command: null, acts: [{ kind: 'climate', seq: 0, ...word }] });
  publishWeather(host, air);
  const routes = actRoutes(host);
  netWorldInput(routes, [input({ op: 'mode', name: 'live', at: -1 }), input({ op: 'force', name: 'storm', at: 0.25 })]);
  expect(air.setMode).toHaveBeenCalledExactlyOnceWith('live', undefined);
  expect(air.force).toHaveBeenCalledExactlyOnceWith('storm', 0.25);
  netWorldInput(routes, [input({ op: 'mode', name: 'nonsense', at: -1 }), input({ op: 'force', name: 'nonsense', at: 0 })]);
  host.addPlayer('b', { x: 1, y: 0, z: 1 });
  netWorldInput(routes, [input({ op: 'force', name: 'storm', at: 0.75 })]);
  expect(air.setMode).toHaveBeenCalledOnce();
  expect(air.force).toHaveBeenCalledOnce();
});

test('a world with no weather has nothing to say to a word', () => {
  expect(() => { netWorldInput(actRoutes(fakeHost()), [{ command: null, acts: [{ ...act }] }]); }).not.toThrow();
});

const { days, weather } = parseRows(JSON.parse(readFileSync('src/shards/_template/data/rows.json', 'utf8')));
test('a data shard\'s own clock hears a page back from a room, as a director\'s does', () => {
  const host = fakeHost(); installDeclaredClimate(host, { days, weather });
  const said = { kind: 'climate', seq: 5, op: 'day', name: 'room', at: 0.75 } as const;
  netWorldInput(actRoutes(host), [{ acts: [said], command: null }]);
  expect(shardRows(host).world.get('day')?.()[0]?.value).toBe(0.75);
  host.dispose();
});

test('a data shard\'s clock steps on the server and is on the wire', () => {
  const host = fakeHost();
  installDeclaredClimate(host, { days, weather });
  const row = (): number | undefined => shardRows(host).world.get('day')?.()[0]?.value;
  const before = row();
  for (let tick = 0; tick < 1200; tick++) host.step();
  expect(shardRows(host).world.get('day')?.()[0]?.name).toBe(DAY_ROW);
  expect(row()).not.toBe(before);
  expect(shardRows(host).world.get('weather')?.().length, 'and its sky is').toBeGreaterThan(0);
});

test('a day clock publishes in steps, so a slow day is a row now and then', () => {
  const host = fakeHost(), clock = { phase: 0.123456789 };
  publishDay(host, clock);
  const value = shardRows(host).world.get('day')?.()[0]?.value ?? 0;
  expect(value * 4096).toBe(Math.round(value * 4096));
});

const program = parseWeatherProgram(JSON.parse(readFileSync('src/shards/nalati-grasslands/data/weather.json', 'utf8')));
const silent: Transport = { send: () => undefined, close: () => undefined, onMessage: () => () => undefined, onClose: () => () => undefined, stats: { rttMs: 0, lossPct: 0, sentBytes: 0, recvBytes: 0 } };
const frame = (cell: number): NetClient['latest'] => ({ tick: 2, baselineTick: -1, cell, lastSeq: 0, owner: new Float64Array(0), rows: new Map(), ride: null, fresh: new Set() });
test('a setting waits for the wire, and each world hears it as the page gets there', () => {
  const page = new WirePage(), said: unknown[] = [], client = new NetClient(silent);
  page.bind(client, () => undefined, () => undefined, () => false, word => { said.push(word); });
  const feed = netClimate(page.climateRows, { weather: program }, word => { page.climate(word); });
  feed.setMode('rain', 0.5); feed.force('clear', 0.1);
  expect(said).toEqual([]);
  client.latest = frame(1); page.frame(null, true);
  expect(said).toHaveLength(2);
  client.latest = frame(0); page.frame(null, true);
  expect(said, 'a mode outlives its world, and a jump does not').toHaveLength(3);
});

test('the page\'s clock follows the server\'s, unless someone stopped it', () => {
  const page = new WirePage(), client = new NetClient(silent), clock = { phase: 0.1, paused: false };
  vi.spyOn(client, 'stateField').mockReturnValue(0.5);
  page.bind(client, () => undefined, () => undefined, () => false);
  client.latest = frame(1); page.frame(null, true, clock);
  expect(clock.phase).toBe(0.5);
  const stopped = { phase: 0.2, paused: true };
  page.frame(null, true, stopped);
  expect(stopped.phase).toBe(0.2);
});
