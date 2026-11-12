import { expect, test } from 'vitest';
import { scriptSideRefusals } from '@wildshard/format/scriptSides';
import { sideRefusalLines, viewGameplayLine } from './productOutput';

// SERVER-PARITY SS8: each SS2/SS7 refusal is one plain line naming the kind or script, its declared side and the missing half.
const script = (id: string, side: 'sim' | 'view', commands: readonly string[] = ['signal']): Record<string, unknown> => ({ id, abi: '1.0', side, commands });
const pineLife = script('pine.life', 'sim', ['flag']);
const named = (files: Record<string, unknown>) => (name: string): unknown => files[name];

test('an unsided client/plan kind and world.assembly stage each name themselves and the missing side entry', () => {
  const plan = { features: [{ kind: 'made.up' }, { kind: 'world.assembly', rows: { stages: [{ kind: 'floating-rock' }, { kind: 'mesh' }] } }, { kind: 'audio.cues' }] };
  expect(sideRefusalLines(new Map([['client/plan', plan]]), named({}))).toEqual([
    'side refused: client/plan kind made.up declares no side, missing its view, both or server entry in shardfile feature-sides.ts',
    'side refused: world.assembly stage floating-rock declares no side, missing its view, both or server entry in shardfile feature-sides.ts',
  ]);
});

test("Pine's sim pine.life bound only by page.life names the script, sim and the missing server half", () => {
  const sections = new Map<string, unknown>([['client/plan', { features: [{ kind: 'page.life', file: 'pine/life.json' }] }], ['actors/return-scripts', [pineLife]]]);
  const files = named({ 'pine/life.json': { program: { script: pineLife } } });
  const lines = sideRefusalLines(sections, files);
  expect(lines).toEqual(['side refused: script pine.life declares sim, missing its server half: only page.life (view) runs it, from pine/life.json']);
  // the same refusal format admission makes of the written folder, one for one
  expect(scriptSideRefusals(sections, files)).toHaveLength(lines.length);
  // a view row there is admitted
  const view = script('pine.life', 'view', ['cue']);
  expect(sideRefusalLines(new Map<string, unknown>([...sections, ['actors/return-scripts', [view]]]), named({ 'pine/life.json': { program: { script: view } } }))).toEqual([]);
});

test('a view row in sim/scripts names the missing page half; a view row that writes gameplay names its commands', () => {
  const sections = new Map<string, unknown>([['sim/scripts', [script('door.open', 'view', ['cue']), script('ok.sim', 'sim')]]]);
  expect(sideRefusalLines(sections, named({}))).toEqual(['side refused: script door.open declares view, missing its page half: it sits in sim/scripts, which only the server runs']);
  expect(scriptSideRefusals(sections, named({}))).toHaveLength(1);
  expect(viewGameplayLine(script('glow', 'view', ['cue', 'move', 'grant']))).toEqual(['side refused: script glow declares view, missing its server half: it emits move, grant, which write gameplay (declare it sim)']);
  expect(viewGameplayLine(script('glow', 'view', ['cue', 'timer', 'channel']))).toEqual([]);
});

test('a page.life copy that is not its return-scripts row is refused by name', () => {
  const sections = new Map<string, unknown>([['client/plan', { features: [{ kind: 'page.life', file: 'pine/life.json' }] }], ['actors/return-scripts', [pineLife]]]);
  const files = named({ 'pine/life.json': { program: { script: { ...pineLife, commands: ['cue'] } } } });
  expect(sideRefusalLines(sections, files)).toEqual(['side refused: page.life program pine.life (pine/life.json) is not its actors/return-scripts row, so it has no admitted side']);
  expect(scriptSideRefusals(sections, files)).toHaveLength(1);
});
