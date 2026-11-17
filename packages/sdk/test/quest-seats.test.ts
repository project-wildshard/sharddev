// oxlint-disable-next-line import/no-nodejs-modules -- The product and Rapier are shipped bytes.
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { beforeAll, expect, test } from 'vitest';
import { questBooks } from '../src/shared/engine/quest/players';
import { loadRapier, type Rapier } from '../src/shared/engine/physics/rapier';
import { leadPlayer } from '../src/shared/engine/sim/leadPlayer';
import { serializeSimSnapshot, snapshotSimHost } from '../src/shared/engine/sim/snapshot';
import { cableModes } from '../src/shared/engine/player/modes';
import { outputDescriptor } from '../src/shared/game/shardfile/outputDescriptor';
import { loadHeadlessProduct } from '../src/sdk/headlessProduct';
import { createTrustedHeadlessResident, type TrustedHeadlessResident } from '../src/sdk/headlessRuntime';
import spots from '../src/shards/driftwood-isle/data/spotsRows.json' with { type: 'json' };
import policy from '../src/shards/pine-hollow/data/nativeStory.json' with { type: 'json' };
import { contractCatalogue } from '../src/shards/pine-hollow/generators/contractRows';
import { pineSpots } from '../src/shards/pine-hollow/generators/spots';
import { PINE_MODES } from '../src/shards/pine-hollow/generators/zipline';
import { CONTRACT_ACTION } from '../src/shared/game/quest/contractBoard';
import { builtProduct } from './fixtures/builtProduct';

// P1-E3.3: the owners that carry one traveller seat every player: a bot rides the cable on its own ride, and it saves.
let rapier: Rapier;
beforeAll(async () => { rapier = await loadRapier(readFileSync('public/assets/physics/rapier.wasm')); });
async function resident(slug: string, snapshot?: string): Promise<TrustedHeadlessResident> {
  const directory = builtProduct(slug), product = await loadHeadlessProduct(directory), descriptor = outputDescriptor(product.shardfile);
  if (descriptor === undefined) throw new Error('Missing output');
  const assets = new Map(descriptor.index.files.map(file => [file.commons === true ? `commons:${file.hash}` : file.hash, Uint8Array.from(readFileSync(`${directory}/${file.path}`))]));
  return createTrustedHeadlessResident({ shard: product.shardfile, assets, rapier, product }, snapshot);
}
const use = (value: number) => ({ kind: 'script' as const, actorId: 'driftwood.interact', value, playerId: 'bot:1' });

test('a bot rides Driftwood\'s zipline alone, and the wire keeps it across a save', async () => {
  const live = await resident('driftwood-isle'), { host } = live, spawn = leadPlayer(host).position.clone();
  const bot = host.addPlayer('bot:1', { x: spots.zipline.prompt.x, y: spots.zipline.prompt.y, z: spots.zipline.prompt.z });
  const cables = cableModes(host.scope);
  live.step([use(2)]);
  expect(cables.seatState('driftwood.zipline', 'bot:1').riding, 'the bot is on its own wire').toBe(true);
  expect(cables.state('driftwood.zipline').riding, 'the lead is not').toBe(false);
  for (let tick = 0; tick < 60; tick++) live.step([]);
  const mid = cables.snapshotSeat('driftwood.zipline', 'bot:1');
  expect(mid.s).toBeGreaterThan(0);
  expect(bot.position.z).toBeLessThan(spots.zipline.top.z);

  const wire = serializeSimSnapshot(snapshotSimHost(host));
  for (let tick = 0; tick < 1200 && cables.seatState('driftwood.zipline', 'bot:1').riding; tick++) live.step([]);
  const books = questBooks(host);
  expect(books.of('bot:1').flags.has('used:zipline'), 'the end is the bot\'s').toBe(true);
  expect(host.flags.has('used:zipline'), 'and no one else\'s').toBe(false);
  expect(leadPlayer(host).position.distanceTo(spawn)).toBeLessThan(1);
  live.dispose();

  const resumed = await resident('driftwood-isle', wire), after = cableModes(resumed.host.scope);
  questBooks(resumed.host).of('bot:1');
  expect(after.seatState('driftwood.zipline', 'bot:1').riding, 'a restored bot is still on the wire').toBe(true);
  expect(after.snapshotSeat('driftwood.zipline', 'bot:1').s).toBeCloseTo(mid.s, 5);
  resumed.dispose();
}, 60_000);

/** The composition's seat parts as a save holds them for the bot. */
const parts = (live: TrustedHeadlessResident): Record<string, string> => {
  const book = snapshotSimHost(live.host).books?.find(row => row.player === 'bot:1'); if (book === undefined) throw new Error('No book');
  return book.parts;
};
const part = (live: TrustedHeadlessResident, prefix: string): unknown => {
  const entry = Object.entries(parts(live)).find(([id]) => id.startsWith(prefix)); if (entry === undefined) throw new Error(`No part ${prefix}`);
  return JSON.parse(entry[1]);
};

test('a bot opens Pine\'s board and meets Mott on its own seat, and the first player\'s stay shut', async () => {
  const live = await resident('pine-hollow'), { host } = live, lead = leadPlayer(host), pine = pineSpots();
  const stand = (at: { readonly x: number; readonly y: number; readonly z: number }): void => { host.players.get('bot:1')?.resetPose({ x: at.x, y: at.y - 1.6, z: at.z }, 0); };
  const board = pine.board; if (board === undefined) throw new Error('No board');
  host.addPlayer('bot:1', { x: board.x, y: board.y, z: board.z }); stand(board); live.step([]);
  const board_ = contractCatalogue().id, as = (actorId: string, value: number) => ({ kind: 'script' as const, actorId, value, playerId: 'bot:1' });
  live.step([as(board_, CONTRACT_ACTION.open)]);
  expect(part(live, 'board:')).toMatchObject({ open: true });
  live.step([as(board_, CONTRACT_ACTION.close)]);
  expect(part(live, 'board:')).toMatchObject({ open: false });

  const row = policy.actions.find(action => action.kind === 'talk' && action.target === policy.trader), person = pine.people?.find(entry => entry.kind === policy.trader);
  if (row === undefined || person === undefined) throw new Error('No trader');
  stand(person.prompt); live.step([]); live.step([as(policy.actor, row.value)]);
  for (let press = 0; press < 40 && !(part(live, 'trader:') as { open: boolean }).open; press++) live.step([as(policy.actor, 7777)]);
  expect(part(live, 'trader:'), 'the talk opens the bot\'s own shop').toMatchObject({ open: true });
  const pack = part(live, 'pack:');
  live.step([as(policy.trade, 0)]);
  expect(part(live, 'pack:'), 'an empty purse buys nothing').toEqual(pack);
  live.step([as(policy.trade, -1)]);
  expect(part(live, 'trader:')).toMatchObject({ open: false });
  expect(lead.id).not.toBe('bot:1');
  live.dispose();
}, 60_000);

test('a bot rides Pine\'s cable on its motor', async () => {
  const live = await resident('pine-hollow'), { host } = live, cable = PINE_MODES.traverse[0];
  if (cable?.kind !== 'zipline') throw new Error('No zipline');
  const prompt = cable.top, bottom = new Vector3(cable.bottom.x, cable.bottom.y, cable.bottom.z);
  const bot = host.addPlayer('bot:1', { x: prompt.x, y: prompt.y, z: prompt.z });
  bot.resetPose({ x: prompt.x, y: prompt.y - 1.6, z: prompt.z }, 0); live.step([]);
  const row = policy.actions.find(action => action.kind === 'cable'); if (row === undefined) throw new Error('No cable action');
  const cables = cableModes(host.scope);
  cables.seat(policy.cable, bot, questBooks(host).of('bot:1').flags);
  live.step([{ kind: 'script', actorId: policy.actor, value: row.value, playerId: 'bot:1' }]);
  expect(cables.seatState(policy.cable, 'bot:1').riding).toBe(true);
  const from = bot.position.distanceTo(bottom);
  for (let tick = 0; tick < 60; tick++) live.step([]);
  expect(bot.position.distanceTo(bottom), 'the motor carries it down the wire').toBeLessThan(from - 1);
  expect(bot.led, 'its client takes no step on the wire').toBe(true); expect(leadPlayer(host).led).toBe(false);
  for (let tick = 0; tick < 3600 && cables.seatState(policy.cable, 'bot:1').riding; tick++) live.step([]);
  expect(cables.seatState(policy.cable, 'bot:1').atEnd).toBe(true);
  expect(bot.led).toBe(false);
  expect(cables.state(policy.cable).atEnd, 'the first player has not ridden').toBe(false);
  live.dispose();
}, 60_000);
