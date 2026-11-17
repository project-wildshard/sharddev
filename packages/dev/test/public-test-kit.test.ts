import { expect, test } from 'vitest';
import { ScriptScenario, ScenarioWorld, scenarioCommand } from '@wildshard/dev/test/scriptScenario';
import { partitionSlabGeometry, slabGeometryBytes } from '@wildshard/sdk/bake/slabChunks';

test('the public test kit exposes the real scenario and slab helpers', () => {
  expect(ScenarioWorld).toBeTypeOf('function');
  expect(ScriptScenario).toBeTypeOf('function');
  expect(scenarioCommand).toBeTypeOf('function');
  expect(partitionSlabGeometry).toBeTypeOf('function');
  expect(slabGeometryBytes).toBeTypeOf('function');
});
