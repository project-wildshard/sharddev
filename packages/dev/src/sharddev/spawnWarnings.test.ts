import { expect, test } from 'vitest';
import { spawnWarnings } from '../../../sdk/src/sharddev/spawnWarnings';
import { checkLines, runCheck, type CheckSteps } from './check';

const layout = (distance: number, radius = 10) => ({
  spawn: { x: 0, y: 80, z: 0 },
  creatures: { brains: [{ id: 'boar-brain', awareRadius: radius }], spawns: [
    { id: 'arrival-boar', brain: 'boar-brain', at: [distance, -20, 0] as const },
    { id: 'passive', brain: null, at: [0, 0, 0] as const },
  ] },
});

test('warns for an aware radius covering the arrival, including its boundary, using horizontal distance', () => {
  const warnings = spawnWarnings(layout(6.7));
  expect(warnings).toEqual([{ code: 'spawn-aware-radius', message: expect.stringContaining('arrival-boar') }]);
  expect(warnings[0]?.message).toMatch(/boar-brain.*6\.7.*10/u);
  expect(spawnWarnings(layout(10))).toHaveLength(1);
  expect(spawnWarnings(layout(10.01))).toEqual([]);
  expect(spawnWarnings(layout(0, 0))).toEqual([]);
});

test('an arrival warning survives check JSON and text without refusing a valid shard', async () => {
  const pass = () => Promise.resolve({ status: 'pass' as const });
  const steps: CheckSteps = { lint: pass, build: pass, validate: () => Promise.resolve({ status: 'pass', warnings: spawnWarnings(layout(6.7)) }), prove: pass, report: pass };
  const result = await runCheck('/source', () => '/out', steps);
  expect(result.verdict).toBe('pass');
  expect(result.refusals).toEqual([]);
  const json = JSON.stringify(result);
  expect(JSON.parse(json).warnings[0]).toMatchObject({ rule: 'spawn-aware-radius', guide: 'GUIDE.md#spawn-aware-radius' });
  expect(checkLines(result).join('\n')).toContain('warning:');
});
