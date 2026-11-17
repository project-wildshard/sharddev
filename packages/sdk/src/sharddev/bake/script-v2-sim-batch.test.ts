import { expect,test } from 'vitest';
import { SimBatchV2,type V2BatchCapture,type V2BatchCandidate,type V2PreparedTransaction } from '@wildshard/engine/script/simBatchV2';
import { compileSimV2 } from '../test/compileSimV2';
import { layoutV2 } from '@wildshard/format/scriptWireV2';

const layout = layoutV2(1024,1,new Map([[1,2],[2,2],[3,2],[4,2],[5,2]]));
const program = `import * as ws from './sdk/as/wsV2';let scratch:i32=0;
export function onBinding():void{scratch++;ws.setState(0,ws.state(0)+scratch);if(ws.parameter(0)>0)unreachable();}`;
let compiled: Promise<Uint8Array> | undefined;
function bytes(): Promise<Uint8Array> { compiled ??= compileSimV2(program,{ io: 1024,ioBytes: layout.bytes });return compiled; }
function stateAt(index: number): number { const region = layout.regions[2];if (region === undefined) throw new Error('Missing state bank');return 1024+region.offset+index*8; }
async function fixture(ordinal = 0): Promise<{
  lane: SimBatchV2; committed: number[]; commits: number[];
  capture: (tick: number,fail?: boolean) => V2BatchCapture;
  prepare: (candidate: V2BatchCandidate) => V2PreparedTransaction;
}> {
  const committed = [2,4], commits: number[] = [], lane = new SimBatchV2(await bytes(),{ layout,ordinal,handle: 1,divisor: 6,bindings: [{ identity: 'a',handle: 2 },{ identity: 'b',handle: 1 }],fuel: 100000,initFuel: 10000,seed: [1,2],output: [{ offset: stateAt(0),count: 2,width: 8 }] });
  return { lane,committed,commits,capture: (tick,fail = false) => ({ observations: {
    bindings: ['b','a'].map(identity => ({ identity,handle: identity === 'a' ? 2 : 1,self: 0,player: 0,observed: new Set<number>(),enabled: true,due: true,divisor: 6 as const,fuel: 10000,previousTick: Math.max(0,tick-6),currentTick: tick,state: [committed[identity === 'a' ? 0 : 1] ?? 0],parameters: [{ name: 'fail',value: fail && identity === 'a' ? 1 : 0 }],fields: [],sample: { atTick: tick,target: 0 } })),players: [],edges: [],events: [],actions: new Set(),eventKinds: new Set(),
  } }),prepare: candidate => {
    if (candidate.counts[2] !== 2) throw new Error('Partial candidate bank');
    const values = candidate.bindings.map((_,i) => candidate.view.getFloat64(stateAt(i),true));
    if (values.some(value => !Number.isSafeInteger(value) || value < 0 || value > 1000)) throw new Error('State domain refusal');
    const commitTick = candidate.tick+1;return { commit: () => { committed.splice(0,2,...values);commits.push(commitTick); } };
  } };
}
test('one call batches all bindings and only the next authoritative fixed step commits', async () => {
  const f = await fixture();let captures = 0;
  const capture = (tick: number) => (): V2BatchCapture => { captures++;return f.capture(tick); };
  expect(f.lane.advance(0,capture(0),f.prepare)).toMatchObject({ status: 'staged',attempts: 1 });expect(f.committed).toEqual([2,4]);expect(captures).toBe(1);
  for (let tick = 1; tick < 6; tick++) expect(f.lane.advance(tick,capture(tick),f.prepare).status).toBe('idle');
  expect(f.committed).toEqual([3,6]);expect(f.commits).toEqual([1]);expect(captures).toBe(1);
  expect(f.lane.advance(6,capture(6),f.prepare).status).toBe('staged');f.lane.advance(7,capture(7),f.prepare);expect(f.committed).toEqual([4,8]);expect(f.commits).toEqual([1,7]);
});
test('a trusted due hint permits exactly one rewind/re-step from the original captured frame', async () => {
  const f = await fixture();let captures = 0, prepares = 0;
  const result = f.lane.advance(0,() => { captures++;return f.capture(0,true); },candidate => { prepares++;expect(candidate.excluded).toBe(2);return f.prepare(candidate); });
  expect(result).toMatchObject({ status: 'staged',attempts: 2,excluded: 2 });expect(captures).toBe(1);expect(prepares).toBe(1);expect(f.committed).toEqual([2,4]);expect(f.lane.failures).toBe(1);
  f.lane.advance(1,() => f.capture(1),f.prepare);expect(f.committed).toEqual([2,5]);
});
test('failure history survives healthy calls, the third disables, and no refused candidate commits', async () => {
  const f = await fixture();
  for (let tick = 0; tick <= 12; tick++) {
    const result = f.lane.advance(tick,() => f.capture(tick,true),f.prepare);
    if (tick === 0 || tick === 6) expect(result).toMatchObject({ status: 'staged',attempts: 2 });
    if (tick === 12) expect(result).toMatchObject({ status: 'disabled',attempts: 1 });
  }
  expect(f.lane.failures).toBe(3);expect(f.lane.disabled).toBe(true);expect(f.committed).toEqual([2,6]);expect(f.commits).toEqual([1,7]);
  expect(f.lane.advance(13,() => { throw new Error('Disabled module captured'); },f.prepare).status).toBe('disabled');expect(f.commits).toEqual([1,7]);
});
test('saved ordinals determine phase, and a second refusal skips the whole module without a third call', async () => {
  const f = await fixture(2**40+3);let prepares = 0;
  for (let tick = 0; tick < 6; tick++) {
    const result = f.lane.advance(tick,() => f.capture(tick),() => { prepares++;throw new Error('Domain refusal'); });
    if (tick === (2**40+3)%6) expect(result).toMatchObject({ status: 'refused',attempts: 2 });else expect(result.status).toBe('idle');
  }
  expect(prepares).toBe(2);expect(f.lane.failures).toBe(2);expect(f.committed).toEqual([2,4]);expect(f.commits).toEqual([]);
  expect(() => f.lane.advance(7,() => f.capture(7),f.prepare)).toThrow('consecutive');
});
