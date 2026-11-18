import creatures from '../data/creatures.json' with { type: 'json' };
import layout from '../data/layout.json' with { type: 'json' };
import { TELL_RADIUS, WARDEN_CORE } from './world';

// SHARD-SOURCE AP36c: the client idle script's bindings (behaviour/idle.as), derived: one idle per creature spawn in
// data/creatures.json, in its species' style, then the fire anchors (braziers A to C over their pads, the Warden's tell
// ring and core) that burn while their field reads 1. idle.as's parameters are [style, amplitude, rate, emitter].
type Site = readonly [number, number, number];
interface Particles { id: number; recipe: string; perTick: number; live: number; lifetimeTicks: number; colour: number[]; size: number; velocity: number[]; gravity: number }
interface Style { parameters: number[]; maxOffset: number; minScale: number; maxScale: number; emitters: Particles[] }
/** One binding of the idle module to a creature or a particle anchor. */
export interface IdleBinding {
  module: string; entity: number; name: string; target: { kind: string; id: string; at?: Site }; reads: { scope: string; id: number }[];
  parameters: number[]; pose: boolean; maxOffset: number; minScale: number; maxScale: number; emitters: Particles[];
}
const particles = (id: number, perTick: number, live: number, lifetimeTicks: number, colour: number[], size: number, rise: number, gravity = 0): Particles =>
  ({ id, recipe: 'platform.particles', perTick, live, lifetimeTicks, colour, size, velocity: [0, rise, 0], gravity });
/** Style 0 breathes (the blobs, with a grey mist), 1 grazes (the boar); the Warden breathes slowly, without mist. */
const BREATHE: Style = { parameters: [0, 0.06, 1.6, 1], maxOffset: 0.5, minScale: 0.8, maxScale: 1.25, emitters: [particles(1, 1, 6, 90, [0.78, 0.8, 0.84], 0.12, 0.6, -0.2)] };
const IDLE: Readonly<Record<string, Style>> = { 'grey-blob': BREATHE, mossling: BREATHE, 'bog-wisp': BREATHE,
  boar: { parameters: [1, 0.35, 1, 0], maxOffset: 0.6, minScale: 0.9, maxScale: 1.1, emitters: [] },
  'barrow-warden': { parameters: [0, 0.05, 1.1, 0], maxOffset: 0.5, minScale: 0.8, maxScale: 1.25, emitters: [] } };
/** Style 3 burns `amplitude` emitters while the anchor's field (data/targets.json) reads 1. */
const FLAME = [particles(1, 1, 24, 44, [1, 0.62, 0.22], 0.12, 1.5), particles(2, 1, 16, 26, [1, 0.45, 0.12], 0.22, 1)];
const RING = [particles(1, 2, 32, 30, [1, 0.42, 0.08], 0.3, 1.3)];
const CORE = [particles(1, 3, 64, 40, [1, 0.85, 0.3], 0.8, 0.9), particles(2, 3, 64, 40, [0.55, 0.95, 1], 0.5, 1.5)];
/** The idle module's reserve over its own bytes: three pairs of Wasm pages and six particle slots. */
export const IDLE_RESERVE = 393_744;

/** The bindings over the module `hash`; `braziers` are braziers A to C's use points (landscape.ts `templateSites`). */
export function templateClientScripts(hash: string, braziers: readonly Site[]): { divisor: number; bindings: IdleBinding[] } {
  const bindings: IdleBinding[] = [], round = (v: number): number => Math.round(v * 1000) / 1000, { x: bx, z: bz } = layout.BOSS;
  const add = (name: string, target: IdleBinding['target'], reads: IdleBinding['reads'], style: Style, pose: boolean): void => {
    const { parameters, maxOffset, minScale, maxScale, emitters } = style;
    bindings.push({ module: hash, entity: bindings.length + 1, name, target, reads, parameters, pose, maxOffset, minScale, maxScale, emitters });
  };
  const fire = (name: string, at: Site, field: number, rate: number, emitters: Particles[]): void =>
    add(name, { kind: 'particles', id: `template.${name}`, at }, [{ scope: 'shared', id: field }], { parameters: [3, emitters.length, rate, 1], maxOffset: 0, minScale: 1, maxScale: 1, emitters }, false);
  for (const spawn of creatures.spawns) add(`${spawn.id.replace(':', '-')}.idle`, { kind: 'creature', id: spawn.id }, [], IDLE[spawn.species] ?? BREATHE, true);
  // MH-2, MH-3: each brazier's fire rises from its bowl, 1.6 m over the pad (just under the use point)
  ['a', 'b', 'c'].forEach((which, i) => { const [x = 0, y = 0, z = 0] = braziers[i] ?? []; fire(`brazier-${which}.flame`, [x, y - 0.1, z], 102 + i, 2, FLAME); });
  for (let k = 0; k < 12; k++) fire(`warden-ring.${k + 1}`, [round(bx + TELL_RADIUS * Math.sin(k * Math.PI / 6)), 0.2, round(bz + TELL_RADIUS * Math.cos(k * Math.PI / 6))], 110, 2, RING);
  fire('warden-core', [bx, WARDEN_CORE, bz], 111, 3, CORE);
  return { divisor: 2, bindings };
}
