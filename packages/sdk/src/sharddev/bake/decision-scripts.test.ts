import { expect, expectTypeOf, it } from 'vitest';
import { actorDecisionRows, decisionScriptRules, parseDecisionScripts, scriptV1Identifier, type DecisionScriptReferences } from '@wildshard/format/decisionScripts';
import { SCRIPT_LIMITS } from '@wildshard/format/scriptLimits';
import { validateOutputSection, type OutputPlatformSectionName } from '@wildshard/format/outputIndex';
import type { PlatformSectionName } from '@wildshard/format/sections';
import { formatJsonSchemas } from '@wildshard/sdk/formatJsonSchema';
import { emitPlatformSections } from '@wildshard/sdk/platformSections';

const modulePath = `blobs/wasm/${'a'.repeat(64)}.wasm`;
const slot = { name: 'phase', type: 'i32', default: 0, min: 0, max: 2, scope: 'binding' };
const raw = {
  id: 'test.boss', abi: '1.0', side: 'sim', module: modulePath, source: 'behaviour/boss.as',
  binding: { encounter: 'test.encounter' }, onFail: 'reset', on: ['start', 'timer', 'move.done'], tick: null,
  actors: { boss: 'test.boss' }, moves: { takeoff: 'test.boss.takeoff' }, timers: ['rest'],
  stateVersion: 1, state: [slot], params: { firstRest: 2 }, reads: ['nearestPlayer', 'random', 'playersWithin'], commands: ['move', 'timer'],
};
function script() { const value = parseDecisionScripts([raw])[0]; if (value === undefined) throw new Error('Missing parsed fixture'); return value; }
function references(): DecisionScriptReferences {
  return { modules: new Map([[modulePath, { abi: 1, pages: 1 }]]),
    ids: { actors: new Set(['test.boss']), moves: new Set(['test.boss.takeoff']) },
    bindings: { encounters: new Set(['test.encounter']), quests: new Set(), zones: new Set() }, migrations: [] };
}

it('emits the defining sim/scripts schema through the typed platform registry', () => {
  expectTypeOf<OutputPlatformSectionName>().toEqualTypeOf<PlatformSectionName>();
  const rows = [script()], emitted = emitPlatformSections(new Map([['sim/scripts', rows]]));
  expect(emitted.sections).toMatchObject([{ name: 'sim/scripts', path: 'sections/sim/scripts.json', schema: 'wildshard:sim/scripts@1' }]);
  const bytes = emitted.files.get('sections/sim/scripts.json'); if (bytes === undefined) throw new Error('Missing script bytes');
  expect(validateOutputSection('sim/scripts', JSON.parse(new TextDecoder().decode(bytes)))).toEqual(rows);
  expect(rows[0]?.pages).toBe(1);
  expect(formatJsonSchemas()['decisionScripts.DecisionScripts']?.type).toBe('array');
  expect(decisionScriptRules(rows, references())).toEqual([]);
});

it('refuses unsupported versions, paths, ops, duplicate bindings and ceilings', () => {
  for (const change of [
    { abi: '2.0' }, { module: '../boss.wasm' }, { source: 'behaviour/../boss.as' }, { source: 'behaviour/generated/boss.as' },
    { pages: 5 }, { pages: 0 }, { tick: 3, on: ['tick'] }, { tick: 2 }, { tick: null, on: ['tick'] },
    { on: ['start', 'start'] }, { reads: ['unlisted'] }, { commands: ['move', 'move'] },
    { binding: { encounter: 'test.encounter', zone: 'test.zone' } }, { arbitrary: true },
    { params: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`value${i}`, i])) },
    { state: Array.from({ length: 17 }, (_, i) => ({ ...slot, name: `value${i}` })) },
  ]) expect(() => parseDecisionScripts([{ ...raw, ...change }])).toThrow();
  expect(() => parseDecisionScripts([raw, raw])).toThrow();
  // the cap edge (D71: one SCRIPT_LIMITS.instances cap, nine modules): the cap admits, one more refuses
  const scripts = (count: number): unknown[] => Array.from({ length: count }, (_, i) => ({ ...raw, id: `test.script${i}`, module: `blobs/wasm/${String(i).repeat(64)}.wasm` }));
  expect(() => parseDecisionScripts(scripts(SCRIPT_LIMITS.instances))).not.toThrow();
  expect(() => parseDecisionScripts(scripts(SCRIPT_LIMITS.instances + 1))).toThrow();
});

it('enforces side capabilities and durable/local typed state ranges', () => {
  for (const state of [
    [{ ...slot, default: 3 }], [{ ...slot, default: 0.5 }], [{ ...slot, min: 2, max: 1 }],
    [{ ...slot, min: -2147483649 }], [{ ...slot, scope: 'local' }],
    [{ ...slot, type: 'bool', default: 1 }], [{ ...slot, type: 'bool', default: true }], [slot, slot],
  ]) expect(() => parseDecisionScripts([{ ...raw, state }])).toThrow();
  expect(() => parseDecisionScripts([{ ...raw, on: ['cue'] }])).toThrow();
  expect(() => parseDecisionScripts([{ ...raw, commands: ['view.sound'] }])).toThrow();
  // per-frame view is the v2 view lane's: a v1 view script or a view-local state slot is refused
  expect(() => parseDecisionScripts([{ ...raw, side: 'view', on: ['start', 'cue'], commands: ['view.sound'], reads: ['field'], state: [{ name: 'phase', type: 'f64', default: 0, scope: 'local' }] }])).toThrow();
});

it('rejects generated-name collisions and reserved names before the bindings compiler', () => {
  expect(scriptV1Identifier('stalk-over')).toBe('stalkOver');
  expect(() => parseDecisionScripts([{ ...raw, moves: { 'take-off': 'test.a', takeOff: 'test.b' } }])).toThrow();
  for (const name of ['class', 'constructor', '__proto__']) {
    expect(() => parseDecisionScripts([{ ...raw, params: { [name]: 1 } }])).toThrow();
  }
});

it('requires admitted module pages and every matching external registry', () => {
  const rows = [script()], known = references();
  expect(decisionScriptRules(rows, { ...known, modules: new Map() })).toContain('script module has matching admitted ABI and fixed pages');
  expect(decisionScriptRules(rows, { ...known, modules: new Map([[modulePath, { abi: 0, pages: 1 }]]) })).toContain('script module has matching admitted ABI and fixed pages');
  expect(decisionScriptRules(rows, { ...known, modules: new Map([[modulePath, { abi: 1, pages: 2 }]]) })).toContain('script module has matching admitted ABI and fixed pages');
  expect(decisionScriptRules(rows, { ...known, ids: {} })).toEqual(expect.arrayContaining(['script actors reference resolves in its platform section', 'script moves reference resolves in its platform section']));
  expect(decisionScriptRules(rows, { ...known, bindings: { ...known.bindings, encounters: new Set() } })).toContain('script binding resolves in its platform section');
});

it('requires an unambiguous complete named script migration chain without unbounded version loops', () => {
  const row = { ...script(), stateVersion: 3 }, known = references();
  expect(decisionScriptRules([row], known)).toContain('script migration chain reaches stateVersion');
  const migrations = [{ scope: 'script:test.boss', from: 1, to: 2 }, { scope: 'script:test.boss', from: 2, to: 3 }];
  expect(decisionScriptRules([row], { ...known, migrations })).toEqual([]);
  expect(decisionScriptRules([row], { ...known, migrations: [migrations[0], migrations[0]].filter(value => value !== undefined) })).toContain('unambiguous consecutive script migrations');
  expect(decisionScriptRules([{ ...row, stateVersion: 0x7fffffff }], known)).toContain('script migration chain reaches stateVersion');
});

it('refuses non-JSON direct input before any accessor runs', () => {
  let reads = 0;
  const input = Object.defineProperty({}, 'id', { enumerable: true, get: () => { reads++; return 'test'; } });
  expect(() => parseDecisionScripts([input])).toThrow('plain JSON'); expect(reads).toBe(0);
});

it('resolves one group row to stable actor owners and refuses ambiguous state scope', () => {
  const group = { ...raw, binding: { spawnGroup: 'test.pack' }, actors: { second: 'test.b', first: 'test.a' }, state: [{ ...slot, scope: 'actor' }] };
  const admitted = parseDecisionScripts([group])[0]; if (admitted === undefined) throw new Error('Missing group');
  expect(actorDecisionRows(admitted).map(member => [member.id, member.actors])).toEqual([
    ['test.boss.actor.first', { first: 'test.a' }], ['test.boss.actor.second', { second: 'test.b' }],
  ]);
  expect(() => parseDecisionScripts([{ ...group, state: [slot] }])).toThrow();
  expect(() => parseDecisionScripts([{ ...group, actors: {} }])).toThrow();
  expect(() => parseDecisionScripts([{ ...group, actors: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`body${index}`, `test.body${index}`])) }])).toThrow();
});
