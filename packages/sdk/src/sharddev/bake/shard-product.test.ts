import { expect, test } from 'vitest';
import { emptyShardfile } from '../author';
import { absentShardProduct, createShardProduct, ProductError, type ShardProduct, type ShardProductInput } from '@wildshard/engine/game/shardfile/shardProduct';

const shardfile = emptyShardfile({ slug: 'p2a-fixture', name: 'P2a fixture', author: 'Wildshard', revision: 3, seed: 1 });
const wasm = new Uint8Array([0, 97, 115, 109]);

function product(overrides: Partial<ShardProductInput> = {}): ShardProduct {
  return createShardProduct({
    slug: 'p2a-fixture', revision: 3, shardfile,
    sections: new Map<string, unknown>([
      ['quests/quests', { quests: shardfile.quests }],
      ['ui/strings', { raised: 'The bridge is up', locked: 'The winch will not turn' }],
    ]),
    streamed: new Set(['world/tiles']),
    files: new Map([['behaviour/director.wasm', { hash: 'a'.repeat(64), url: `https://example.test/blobs/wasm/${'a'.repeat(64)}.wasm` }]]),
    read: hash => hash === 'a'.repeat(64) ? Promise.resolve(wasm) : Promise.reject(new Error('unexpected hash')),
    ...overrides,
  });
}

function refusal(read: () => unknown): ProductError {
  try { read(); } catch (error) { if (error instanceof ProductError) return error; throw error; }
  throw new Error('expected a ProductError');
}

test('platform sections read synchronously through their defining types', () => {
  const p = product();
  const quests = p.section('quests/quests').quests;
  expect(quests).toBe(shardfile.quests);
  expect(p.has('quests/quests')).toBe(true);
  expect(p.has('world/tiles')).toBe(true);
  expect(p.shardfile).toBe(shardfile);
});

test('a missing or streamed section refuses with its reason', () => {
  const p = product();
  expect(refusal(() => p.section('combat/items')).reason).toBe('missing-section');
  expect(refusal(() => p.section('world/tiles')).reason).toBe('stream-section');
});

test('a caller cannot supply custom sections even through direct native inputs',()=>{
  expect(()=>product({sections:new Map([['custom/trades',[]]])})).toThrow('only platform sections');
  expect(()=>product({streamed:new Set(['custom/trades'])})).toThrow('only platform sections');
  expect(()=>product({files:new Map([['custom/private.bin',{hash:'b'.repeat(64),url:'/private.bin'}]])})).toThrow('custom output names are retired');
  const p=product({check:true});const strings=p.section('ui/strings');
  expect(Object.isFrozen(strings)).toBe(true);
  expect(p.section('ui/strings')).toBe(strings);
});

test('strings are read all at once and refuse naming every missing key', () => {
  const p = product();
  const strings = p.strings(['raised', 'locked']);
  expect(strings.raised).toBe('The bridge is up');
  expect(Object.isFrozen(strings)).toBe(true);
  const error = refusal(() => p.strings(['raised', 'vane', 'roost']));
  expect(error.reason).toBe('missing-strings');
  expect(error.message).toContain('vane, roost');
  expect(product({ sections: new Map() }).strings([])).toEqual({});
});

test('files are read by logical name through the verified reader', async () => {
  const p = product();
  expect(p.hasFile('behaviour/director.wasm')).toBe(true);
  expect(await p.file('behaviour/director.wasm')).toBe(wasm);
  expect(p.url('behaviour/director.wasm')).toMatch(/blobs\/wasm\/a{64}\.wasm$/u);
  await expect(p.file('models/missing.glb')).rejects.toMatchObject({ reason: 'missing-file' });
  expect(refusal(() => p.url('models/missing.glb')).reason).toBe('missing-file');
});

test('private named JSON refuses before reading bytes',async()=>{
  const files=new Map([['rig.json',{hash:'b'.repeat(64),url:'/rig.json'}]]);let reads=0;
  const p=product({files,read:()=>{reads++;return Promise.resolve(new TextEncoder().encode('{}'));}});
  await expect(p.json('rig.json')).rejects.toMatchObject({reason:'schema'});expect(reads).toBe(0);
  await expect(p.json('missing.json')).rejects.toMatchObject({reason:'missing-file'});
  await expect(absentShardProduct('absent').json('rig.json')).rejects.toMatchObject({reason:'absent'});
});

test('an entry with no built output refuses every read with the fix', async () => {
  const p = absentShardProduct('far-reach-legacy');
  expect(p.has('quests/quests')).toBe(false);
  const error = refusal(() => p.section('quests/quests'));
  expect(error.reason).toBe('absent');
  expect(error.message).toContain('wildshard build far-reach-legacy');
  expect(refusal(() => p.shardfile).reason).toBe('absent');
  expect(refusal(() => p.strings(['raised'])).reason).toBe('absent');
  await expect(p.file('models/roc.glb')).rejects.toMatchObject({ reason: 'absent' });
});

test('a source label alone cannot register a private named JSON',async()=>{
  const files=new Map([['rig.json',{hash:'b'.repeat(64),url:'/rig.json',jsonSchema:{$comment:'@wildshard/format/fixedDraws#FixedDrawRowsSchema'}}]]);
  await expect(product({files,read:()=>Promise.resolve(new TextEncoder().encode('[]'))}).json('rig.json')).rejects.toMatchObject({reason:'schema'});
});
