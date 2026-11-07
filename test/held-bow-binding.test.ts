import { painterlyMaterial } from '../src/client/engine/world/painterly';
import recurve from '../public/assets/nalati/baked/recurve-pool.json' with { type: 'json' };
import { expect, test } from 'vitest';
import { BufferGeometry } from 'three';
import { bindHeldBow } from '../src/client/game/weapons/heldLauncher';
import { HeldBowDefinitionSchema } from '@wildshard/format/weaponProfiles';
import { formatJsonSchema } from '../src/sharddev/formatJsonSchema';
import { PINE_HELD_BOW } from '../src/shards/pine-hollow/generators/longbow';
import { recurveBase } from '../src/shards/nalati-grasslands/generators/recurvePool';
import * as v from 'valibot';

test('both bows bind borrowed parts and retain their distinct loose and riding policies', () => {
  const pine = v.parse(HeldBowDefinitionSchema, PINE_HELD_BOW);
  const nalati = v.parse(v.object(HeldBowDefinitionSchema.entries), recurve);
  expect(nalati.base).toEqual(v.parse(HeldBowDefinitionSchema, { ...nalati, base: recurveBase() }).base);
  for (const definition of [pine, nalati]) {
    for (const material of Object.values(definition.bow.materials)) if ('painterly' in material) {
      const built = painterlyMaterial(null, material.painterly); built.dispose();
    }
    const geometry = new Map(Object.values(definition.bow.parts).map(id => [id, new BufferGeometry()]));
    const bow = bindHeldBow(definition, { geometry: id => geometry.get(id) ?? null });
    for (const [id, part] of geometry) expect(bow.model.geometry?.get(id)).toBe(part);
    expect(bow.profile.arrowLength).toBe(v.parse(v.object({ length: v.number() }), JSON.parse(definition.bow.bake.arrow)).length);
    expect(bow.profile.draw).toEqual(definition.base.draw);
    expect(bow.profile.projectile).toEqual(definition.base.projectile);
    expect(bow.profile.loose).toEqual(definition.base.loose);
    expect(bow.profile.quiver).toBe(definition.base.quiver);
    expect(() => bindHeldBow(definition, { geometry: () => null })).toThrow('bow part');
  }
  expect(pine.base.quiver).toBe(20);
  expect(pine.base.parent).toBe('weapon.bow');
  expect(pine.base.mounted).toBeUndefined();
  const riding = bindHeldBow(nalati, { geometry: () => new BufferGeometry() }).profile.mounted;
  expect(riding?.gaits).toEqual([{ below: 0.3, spread: 0.3 }, { below: 3.2, spread: 0.8 },
    { below: 6.5, spread: 3 }, { below: 10.5, spread: 1.5 }, { below: Infinity, spread: 1.8 }]);
});

test('binding refuses malformed feel and parent identities before borrowing parts', () => {
  let reads = 0;
  const library = { geometry: () => { reads++; return new BufferGeometry(); } };
  expect(() => bindHeldBow({ ...PINE_HELD_BOW, base: { ...PINE_HELD_BOW.base, quiver: -1 } }, library)).toThrow();
  expect(reads).toBe(0);
  expect(() => bindHeldBow({ ...PINE_HELD_BOW, base: { ...PINE_HELD_BOW.base, parent: 'invalid' } }, library)).toThrow();
  expect(reads).toBe(0);
  expect(() => bindHeldBow({ ...PINE_HELD_BOW, base: { ...PINE_HELD_BOW.base, draw: { ...PINE_HELD_BOW.base.draw, holdSteady: 9 } } }, library)).toThrow('fatigue');
  expect(reads).toBe(0);
});

test('the bow definition emits a wire schema and refuses non-finite bake values', () => {
  expect(() => formatJsonSchema(HeldBowDefinitionSchema, 'draft-07')).not.toThrow();
  for (const value of [Infinity, -Infinity, Number.NaN]) {
    expect(() => bindHeldBow({ ...PINE_HELD_BOW, bow: { ...PINE_HELD_BOW.bow,
      arrow: { ...PINE_HELD_BOW.bow.arrow, bury: value } } }, { geometry: () => new BufferGeometry() })).toThrow();
  }
});

test('the defining schema rejects all original bow invariants before any borrowed geometry', () => {
  const mounted = v.parse(v.object(HeldBowDefinitionSchema.entries), recurve), base = mounted.base;
  if (base.mounted === undefined) throw new Error('Missing mounted fixture');
  const invalid: unknown[] = [
    { ...PINE_HELD_BOW, base: { ...PINE_HELD_BOW.base, parent: 'invalid' } },
    { ...PINE_HELD_BOW, base: { ...PINE_HELD_BOW.base, draw: { ...PINE_HELD_BOW.base.draw, holdSteady: 9 } } },
    { ...PINE_HELD_BOW, bow: { ...PINE_HELD_BOW.bow, styles: {} } },
    { ...PINE_HELD_BOW, bow: { ...PINE_HELD_BOW.bow, styles: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), 'paint'])) } },
  ];
  for (const gaits of [[{ below: null, spread: 1 }, { below: 2, spread: 1 }], [{ below: 2, spread: 1 }, { below: 2, spread: 1 }], [{ below: 3, spread: 1 }, { below: 2, spread: 1 }]]) {
    invalid.push({ ...mounted, base: { ...base, mounted: { ...base.mounted, gaits } } });
  }
  for (const input of invalid) {
    let reads = 0;
    expect(() => v.parse(HeldBowDefinitionSchema, input)).toThrow();
    expect(() => bindHeldBow(input, { geometry: () => { reads++; return new BufferGeometry(); } })).toThrow();
    expect(reads).toBe(0);
  }
  expect(() => formatJsonSchema(HeldBowDefinitionSchema, 'draft-07')).not.toThrow();
});
