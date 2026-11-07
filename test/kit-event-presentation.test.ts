import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { InteractSfx } from '../src/client/engine/audio/interactSfx';
import type { InteractEvent } from '../src/client/engine/world/interact/Interactables';
import { pineTableFromPlacements } from '../src/shards/pine-hollow/generators/questTable';
import { pineSpots } from '../src/shards/pine-hollow/generators/spots';
import { PINE_KIT_EVENTS } from '../src/shards/pine-hollow/generators/questEvents';
import DRIFTWOOD_KIT_EVENTS from '../src/shards/driftwood-isle/data/questEvents.json' with { type: 'json' };

// GR8: called, not read from a scheduler job's output
const spots = pineSpots();

function event(type: InteractEvent['type'], look: 'resin' | 'token' | 'seaglass' | 'shard' = 'seaglass'): InteractEvent {
  return { type, def: { kind: 'pickup', id: 'token-3', at: { poi: 'world', x: 0, z: 0 }, look, label: 'A pickup' }, at: new Vector3() };
}

test('ordered event rows retain item/count-chip, toast, sound and sting effects without owning state', () => {
  const effects: string[] = [], sounds: { name: string; rate: number; delay: number }[] = [];
  const sfx = new InteractSfx({ voices: { play: (name, options) => {
    effects.push(name); sounds.push({ name, rate: options?.rate ?? 1, delay: options?.delay ?? 0 });
    return undefined;
  } } });
  const driftwood = sfx.bindEvents(DRIFTWOOD_KIT_EVENTS, { toast: text => { effects.push(text); },
    item: id => id === 'resin' ? { label: 'Amber resin', add: n => { effects.push(`give ${String(n)}`); } } : null,
    calls: new Map([['glass', () => { effects.push('glass tally'); }], ['pickup', () => { effects.push('pickup sting'); }]]) });
  driftwood({ ...event('found'), item: 'resin', n: 3, flag: 'shard:wreck' });
  expect(effects).toEqual(['give 3', 'Amber resin ×3', 'ui-glyph', 'pickup sting']);
  expect(sounds.at(-1)?.delay).toBeGreaterThan(0);
  effects.length = 0; driftwood({ ...event('take'), item: 'resin', n: 2 });
  expect(effects).toEqual(['give 2', 'glass tally', 'ui-chime']);
  effects.length = 0; driftwood({ ...event('found'), text: 'Found a key' });
  expect(effects).toEqual(['Found a key', 'ui-chime']);
  driftwood(event('press')); const pressed = sounds.at(-1)?.rate;
  driftwood(event('release')); expect(sounds.at(-1)?.rate).toBeGreaterThan(pressed ?? 0);

  let resin = 0;
  const pine = sfx.bindEvents(PINE_KIT_EVENTS, { toast: text => { effects.push(text); },
    item: id => id === 'amber-resin' ? { label: 'Amber resin', add: n => { effects.push(`resin ${String(n)}`); } } : null, calls: new Map([
    ['resin', () => { resin++; effects.push('resin chip'); }], ['all-resin', () => { if (resin > 0) effects.push('all resin'); }],
    ['token', () => { effects.push('token chip'); }], ['all-tokens', () => { effects.push('shelf'); }],
    ['pickup', () => { effects.push('pickup sting'); }],
  ]) });
  effects.length = 0; pine({ ...event('take', 'resin'), item: 'amber-resin', n: 1 });
  expect(effects).toEqual(['resin 1', 'resin chip', 'ui-chime', 'all resin']);
  const tokens = pineTableFromPlacements(spots.rows).rows.filter(row => row.kind === 'pickup' && row.look === 'token');
  const originalNames = ['the fire lookout', 'the hollow log', 'the islet', "the King's stones", 'the waterfall', 'the ridge cabin', 'the mill hamlet', 'under the creek bridge'];
  expect(tokens).toHaveLength(originalNames.length);
  for (const [index, def] of tokens.entries()) {
    const text = `Carved token — ${originalNames[index]}`;
    expect(def.toast).toBe(text);
    effects.length = 0; pine({ type: 'take', def, text, at: new Vector3() });
    expect(effects).toEqual(['token chip', text, 'ui-glyph', 'shelf']);
  }
  effects.length = 0; pine(event('press')); expect(effects).toEqual([]);
  pine(event('locked')); expect(effects).toEqual(['Locked', 'ui-locked']);
});

test('all event owners and bounded rows preflight before effects and input mutation cannot change the binder', () => {
  let effects = 0;
  const sfx = new InteractSfx({ voices: { play: () => { effects++; return undefined; } } }), ports = { toast: () => { effects++; } };
  expect(() => sfx.bindEvents([{ types: ['take'], effects: [{ kind: 'sound', sound: 'chime' }, { kind: 'call', name: 'missing' }] }], ports)).toThrow();
  expect(() => sfx.bindEvents([{ types: ['take'], effects: [{ kind: 'item' }] }], ports)).toThrow();
  expect(() => sfx.bindEvents([{ types: ['escape'], effects: [] }], ports)).toThrow();
  expect(() => sfx.bindEvents([{ types: ['take'], effects: [{ kind: 'sound', sound: 'chime', delay: Infinity }] }], ports)).toThrow();
  expect(() => sfx.bindEvents(Array.from({ length: 100 }, () => ({ types: ['take'], effects: [] })), ports)).toThrow();
  expect(effects).toBe(0);
  const rows = [{ types: ['take'], effects: [{ kind: 'sound', sound: 'chime' }] }];
  const bound = sfx.bindEvents(rows, ports); rows[0]?.effects.push({ kind: 'sound', sound: 'glyph' });
  bound(event('take')); expect(effects).toBe(1);
});
