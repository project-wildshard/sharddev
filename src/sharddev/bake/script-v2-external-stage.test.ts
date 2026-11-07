import { expect,test,vi } from 'vitest';
import * as v from 'valibot';
import { DecisionHost,type DecisionScript,type DecisionSnapshot,type DecisionHostOptions,type DecisionExternalCommand } from '@wildshard/engine/script/decision';
import { compileScript } from './compileScript';

let compiled: Promise<Uint8Array> | undefined;
function bytes(): Promise<Uint8Array> {
  compiled ??= compileScript(`export function ws_abi():i32{return 1;}export function ws_io():i32{return 16384;}
export function ws_init(lo:i32,hi:i32):void{}export function ws_handle():i32{unreachable();return 0;}`,{ abi: 1 });return compiled;
}
async function fixture(external = true,authority = true) {
  const script: DecisionScript = { id: 'original',module: 'oracle',side: 'sim',on: ['tick'],tick: 10,onFail: 'hold',stateVersion: 1,
    state: [{ name: 'calls',type: 'i32',default: 0,scope: 'binding',min: 0,max: 10 }],params: {},ids: {},reads: [],lists: [],commands: [] };
  const effects: DecisionExternalCommand[] = [];
  const options: DecisionHostOptions = { scripts: [script],bindings: [{ id: 1,script: 'original',self: 0,actors: [],instance: 0 }],
    modules: new Map([['oracle',await bytes()]]),seed: [1,2],...(external ? { externalDivisor: 6 } : {}),
    world: { read: () => 0,list: () => 0,prepare: () => ({ commit: () => undefined }),failed: () => { throw new Error('Unexpected original guest call'); },
      ...(authority ? { prepareExternal: (commands: readonly DecisionExternalCommand[]) => {
        for (const command of commands) if (![14,23,25].includes(command[0]) || command[1] !== 1) throw new Error('Invalid concrete command authority');
        const detached = commands.map(row => [...row] satisfies DecisionExternalCommand);
        return { commit: () => { effects.push(...detached); } };
      } } : {}) } };
  const host = new DecisionHost(options);return { host,effects };
}
function stage(before: DecisionSnapshot,external: readonly DecisionExternalCommand[]): DecisionSnapshot {
  return { ...before,bindings: before.bindings.map(row => ({ ...row,pending: [] })),staged: [{ binding: 1,tick: before.tick,observed: [],commands: [],external,
    slots: { calls: 1 },timers: {},rng: before.bindings[0]?.rng ?? 0,lastCall: before.tick }] };
}
const savedWire = v.custom<DecisionSnapshot>(row => typeof row === 'object' && row !== null);
const ordered: readonly DecisionExternalCommand[] = [[23,1,1,0,0,0],[25,1,3,4,5,6],[14,1,1,2,3,0]];

test('saving after v2 stage and before commit retains ordered op25 exactly once in the SAME owner', async () => {
  const f = await fixture();for (let tick = 1; tick <= 6; tick++) f.host.stepExternal(tick);
  const prepared = f.host.prepareRestore(stage(f.host.snapshot(),ordered));expect(f.effects).toEqual([]);prepared();
  expect(f.effects).toEqual([]);expect(f.host.state(1)).toEqual({ calls: 0 });
  const saved = JSON.stringify(f.host.snapshot()), restored = await fixture(), instantiate = vi.spyOn(WebAssembly,'Instance');
  try { restored.host.restore(v.parse(savedWire,JSON.parse(saved)));expect(instantiate).not.toHaveBeenCalled(); } finally { instantiate.mockRestore(); }
  expect(JSON.stringify(restored.host.snapshot())).toBe(saved);expect(restored.effects).toEqual([]);
  f.host.stepExternal(7);restored.host.stepExternal(7);
  expect(f.effects).toEqual(ordered);expect(restored.effects).toEqual(ordered);expect(restored.host.state(1)).toEqual({ calls: 1 });
  f.host.stepExternal(8);restored.host.stepExternal(8);expect(restored.effects).toEqual(ordered);expect(restored.host.snapshot()).toEqual(f.host.snapshot());
});

test('external malformed suffix and missing authority refuse without native prefix or continuation publication', async () => {
  const f = await fixture();for (let tick = 1; tick <= 6; tick++) f.host.stepExternal(tick);
  const before = f.host.snapshot();
  const bad: readonly (readonly DecisionExternalCommand[])[] = [
    [[23,1,1,0,0,0],[25,2,0,0,0,0]],[[25,1,0,0,0,0],[99,1,0,0,0,0]],
    [[13,0,1,4,0,0]],[[25,1,0,0,0,Number.NaN]],[[25.5,1,0,0,0,0]],Array.from({ length: 33 },(): DecisionExternalCommand => [23,1,1,0,0,0]),
  ];
  for (const commands of bad) {
    expect(() => f.host.prepareRestore(stage(before,commands))).toThrow();expect(f.host.snapshot()).toEqual(before);expect(f.effects).toEqual([]);
  }
  const absent = await fixture(true,false);for (let tick = 1; tick <= 6; tick++) absent.host.stepExternal(tick);
  expect(() => absent.host.prepareRestore(stage(absent.host.snapshot(),ordered))).toThrow('authority');
  const legacy = await fixture(false);expect(() => legacy.host.prepareRestore(stage({ ...legacy.host.snapshot(),tick: 6 },ordered))).toThrow('authority');
});

test('default v1 save bytes do not acquire the external command key', async () => {
  const f = await fixture(false), before = JSON.stringify(f.host.snapshot());
  f.host.restore(v.parse(savedWire,JSON.parse(before)));expect(JSON.stringify(f.host.snapshot())).toBe(before);expect(before).not.toContain('external');
});


test('in-memory op25 signed zero retains f64 while saved JSON keeps its existing numeric canonicalization', async () => {
  const f = await fixture();for (let tick = 1; tick <= 6; tick++) f.host.stepExternal(tick);
  f.host.prepareRestore(stage(f.host.snapshot(),[[25,1,-0,0,0,0]]))();
  expect(Object.is(f.host.snapshot().staged[0]?.external?.[0]?.[2],-0)).toBe(true);
  const saved = JSON.stringify(f.host.snapshot()),restored = await fixture();restored.host.restore(v.parse(savedWire,JSON.parse(saved)));
  expect(JSON.stringify(restored.host.snapshot())).toBe(saved);expect(Object.is(restored.host.snapshot().staged[0]?.external?.[0]?.[2],0)).toBe(true);
  restored.host.stepExternal(7);expect(Object.is(restored.effects[0]?.[2],0)).toBe(true);
});
