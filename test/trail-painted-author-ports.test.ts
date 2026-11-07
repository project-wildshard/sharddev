import { BoxGeometry, MeshStandardMaterial } from 'three';
import { expect, expectTypeOf, test } from 'vitest';
import type { ModelDef, ModelPart } from '../src/client/engine/models/model';
import { Rng } from '../src/sharddev/random';
import { buildFencePost, type TrailMeshPart } from '../src/shards/driftwood-isle/generators/trailsideModels';
import { painted, paintedSpecimen, type PaintedModelSource } from '../src/shards/nalati-grasslands/generators/painted';

test('trail draws borrow the exact supplied material and preserve every produced draw flag', () => {
  expectTypeOf<TrailMeshPart>().toExtend<ModelPart>();
  const material = new MeshStandardMaterial(), parts = buildFencePost(material, {}, new Rng(9392));
  try {
    expect(parts).toHaveLength(1);
    const part = parts[0]; if (part === undefined) throw new Error('Missing original post');
    expect(part.material).toBe(material); expect(part.castShadow).toBe(true); expect(part.receiveShadow).toBe(true);
    expect(Object.keys(part)).toEqual(['geometry', 'material', 'castShadow', 'receiveShadow']);
  } finally { for (const part of parts) part.geometry.dispose(); material.dispose(); }
});

test('offline painter markers retain native header compatibility, typed defaults and runtime refusal', () => {
  expectTypeOf<ModelDef<{ width: number }>>().toExtend<PaintedModelSource<{ width: number }>>();
  const marker = painted<{ width: number }>((kit, _at, params) => {
    kit.add(new BoxGeometry(params.width, 1, 1), 0x557733, { jitter: 0, brush: 0 }); return {};
  }, { seed: 17 });
  expect(() => marker()).toThrow('Paint recipes run only in the offline specimen producer');
  const source = { id: 'orchard/board', defaults: { width: 2 }, build: marker };
  const parts = paintedSpecimen(source, { width: 3 }, () => 0);
  try {
    expect(parts).toHaveLength(1);
    const part = parts[0], box = part?.geometry.boundingBox;
    if (part === undefined || box === undefined || box === null) throw new Error('Missing painted specimen bounds');
    expect(box.max.x - box.min.x).toBe(3); expect(part.layer).toBeNull();
    expect(() => paintedSpecimen({ ...source, build: () => [] }, { width: 3 }, () => 0)).toThrow('not a painted model');
  } finally { for (const part of parts) part.geometry.dispose(); }
});
