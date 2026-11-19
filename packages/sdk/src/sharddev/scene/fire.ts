import { BufferAttribute, BufferGeometry, Group, Mesh } from 'three';
import { abs, float, fract, length, mix, sin, smoothstep, time, uv, vec2, vec3 } from 'three/tsl';
import { GraphMaterial, graph, graphInputs } from '../materials';

/**
 * MOSSGATE-ZONE MZ7 (QA 11-19 row 29, Jake: "Flame effect here is dog shit"): one fire for every shard, drawn as plain
 * meshes in graph materials, so it lives in a panel part (shown by a quest field) and draws the same on a grid cell and a
 * standalone page. A panel is one library GLB with no tile motion, sprites, points or lights (AP16), so the fire moves in
 * its own graphs, over the graph clock (`time`):
 *
 * - **flames:** three crossed cards and a narrower core, additive and unlit, a soft teardrop painted from the card's uv in
 *   the fragment (no texture), its sides licking and its height breathing out of step per card;
 * - **embers:** small crossed cards that climb from the coals, drift and fade, each on its own phase;
 * - **smoke:** a few soft grey cards rising slowly over the flames, alpha blended, thin;
 * - **glow:** a disc on the coals that flickers with the flames.
 *
 * Each card's seed rides its vertex colour (r: seed, g: speed, b: phase), so one material draws every fire in a part and a
 * panel's merge keeps them apart. Its origin is the coals' top: `fire().position.set(x, coalTop, z)` seats it in its bowl.
 * Phone-cheap: four materials, about 60 triangles a fire, no lights, no texture.
 */
export interface FireOptions {
  /** 1 is a brazier's bowl, about a 1.2 m flame */
  readonly size?: number;
  /** embers climbing (0 to 24, default 14) */
  readonly embers?: number;
  /** smoke cards (0 to 6, default 3) */
  readonly smoke?: number;
  /** a seed, so neighbouring fires never flicker together */
  readonly seed?: number;
}

const seedOf = graphInputs.vertexColour.x, speedOf = graphInputs.vertexColour.y, phaseOf = graphInputs.vertexColour.z;
/** The flame's ramp, linear: a red edge, orange body, yellow-white core. */
const FLAME = { edge: [0.85, 0.12, 0.01], body: [1, 0.36, 0.04], core: [1, 0.72, 0.3] } as const;

let shared: { flame: GraphMaterial; ember: GraphMaterial; smoke: GraphMaterial; glow: GraphMaterial } | null = null;
function materials(): NonNullable<typeof shared> {
  if (shared !== null) return shared;
  const additive = { blend: 'additive', depthWrite: false, singlePass: true } as const;
  const blended = { blend: 'alpha', depthWrite: false, singlePass: true } as const;
  const t = time, s = seedOf.mul(37.0);
  // flames: the side licks rise up the card (two sines), the height breathes; a teardrop of width w at height h
  const u = uv().x, v = uv().y;
  const lick = sin(v.mul(9.0).sub(t.mul(7.0)).add(s)).mul(0.07).add(sin(v.mul(17.0).sub(t.mul(11.0)).add(s.mul(1.7))).mul(0.035)).mul(v);
  const h = v.div(sin(t.mul(5.3).add(s)).mul(0.12).add(0.88));
  const width = smoothstep(0.0, 0.22, h).mul(h.oneMinus().max(0.0).pow(0.8)).mul(0.95).add(0.001);
  const d = abs(u.sub(0.5).add(lick)).mul(2.0).div(width);
  const edge = smoothstep(0.45, 1.0, d).oneMinus(), core = smoothstep(0.0, 0.55, d.add(h.mul(1.3))).oneMinus();
  const fade = edge.mul(smoothstep(0.62, 1.0, h).oneMinus());
  const ramp = mix(mix(vec3(...FLAME.edge), vec3(...FLAME.body), edge), vec3(...FLAME.core), core.mul(core));
  const flicker = sin(t.mul(13.0).add(s)).mul(0.08).add(sin(t.mul(29.0).add(s.mul(2.3))).mul(0.05)).add(1.0);
  // the card's tip sways a little (the card is crossed, so this reads as the flame leaning in a draught)
  const sway = vec3(sin(t.mul(2.3).add(s)).mul(0.05), 0, sin(t.mul(1.9).add(s.mul(0.7))).mul(0.04)).mul(v.mul(v));
  const flame = new GraphMaterial({ ...graph({ model: 'unlit', doubleSided: true, vertex: { offset: sway },
    surface: { colour: ramp.mul(flicker).mul(0.95), alpha: fade.mul(flicker).min(1.0) } }), effectState: additive });

  // embers: each card climbs `rise` metres over its life, drifting, then starts again at the coals
  const life = fract(t.mul(speedOf.mul(0.5).add(0.25)).add(phaseOf));
  const climb = vec3(sin(life.mul(6.0).add(s)).mul(0.22), life.mul(2.0), sin(life.mul(5.0).add(s.mul(1.3))).mul(0.22)).mul(life.mul(0.6).add(0.4));
  const dot = smoothstep(0.18, 0.5, length(uv().sub(vec2(0.5, 0.5)))).oneMinus();
  const ember = new GraphMaterial({ ...graph({ model: 'unlit', doubleSided: true, vertex: { offset: climb },
    surface: { colour: vec3(1.0, 0.55, 0.15).mul(3.0), alpha: dot.mul(life.oneMinus().pow(1.4)).mul(smoothstep(0.0, 0.06, life)) } }), effectState: additive });

  // smoke: slow, soft, thin; it rises 2.4 m and thins out as it goes
  const age = fract(t.mul(speedOf.mul(0.08).add(0.06)).add(phaseOf));
  const puff = smoothstep(0.15, 0.5, length(uv().sub(vec2(0.5, 0.5)))).oneMinus();
  const drift = vec3(sin(age.mul(3.0).add(s)).mul(0.3), age.mul(2.4), float(0)).add(vec3(uv().x.sub(0.5), uv().y.sub(0.5), 0).mul(age.mul(0.9)));
  const smoke = new GraphMaterial({ ...graph({ model: 'unlit', doubleSided: true, vertex: { offset: drift },
    surface: { colour: vec3(0.16, 0.15, 0.14), alpha: puff.mul(age.mul(4.0).min(1.0)).mul(age.oneMinus()).mul(0.28) } }), effectState: blended });

  // the glow on the coals and the bowl's lip: a disc, brightest at the middle, flickering with the flames
  const r = length(uv().sub(vec2(0.5, 0.5))).mul(2.0);
  const glow = new GraphMaterial({ ...graph({ model: 'unlit', doubleSided: true,
    surface: { colour: vec3(1.0, 0.45, 0.12).mul(flicker), alpha: smoothstep(0.0, 1.0, r).oneMinus().mul(0.8) } }), effectState: additive });
  shared = { flame, ember, smoke, glow };
  return shared;
}

/** A card of `w` x `h` metres standing on the origin, turned `turn` round y, its seed in its vertex colour. */
function card(w: number, h: number, turn: number, base: readonly [number, number, number], seed: readonly [number, number, number]): BufferGeometry {
  const c = Math.cos(turn), sn = Math.sin(turn), hw = w / 2;
  const corners = [[-hw, 0], [hw, 0], [hw, h], [-hw, h]] as const;
  const position = new Float32Array(12), uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), colour = new Float32Array(12);
  corners.forEach(([x, y], i) => { position.set([base[0] + x * c, base[1] + y, base[2] - x * sn], i * 3); colour.set(seed, i * 3); });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3)); g.setAttribute('uv', new BufferAttribute(uvs, 2)); g.setAttribute('color', new BufferAttribute(colour, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  return g;
}
/** A flat disc of `radius` at height `y`, its uv spanning it (for the glow). */
function disc(radius: number, y: number, seed: readonly [number, number, number]): BufferGeometry {
  const position = new Float32Array([-radius, y, -radius, radius, y, -radius, radius, y, radius, -radius, y, radius]);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3)); g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array([...seed, ...seed, ...seed, ...seed]), 3));
  g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals();
  return g;
}

/** One fire (see the module comment): put its origin on the coals. */
export function fire(options: FireOptions = {}): Group {
  const size = options.size ?? 1, M = materials(), root = new Group();
  root.name = 'fire';
  let state = Math.max(1, Math.round((options.seed ?? 7) * 7919) % 2147483647);
  const next = (): number => { state = (state * 16807) % 2147483647; return state / 2147483647; };
  const add = (geometry: BufferGeometry, material: GraphMaterial, name: string): void => { const m = new Mesh(geometry, material); m.name = name; root.add(m); };
  // three tongues crossed at 60 degrees, and a narrower core: from any side the flame has body
  for (const [turn, w, h] of [[0, 1.0, 1.35], [Math.PI / 3, 0.9, 1.15], [(2 * Math.PI) / 3, 0.85, 1.05], [Math.PI / 6, 0.5, 0.72]] as const) {
    add(card(w * size, h * size, turn, [0, -0.04 * size, 0], [next(), next(), next()]), M.flame, 'flame');
  }
  add(disc(0.55 * size, 0.02 * size, [next(), next(), next()]), M.glow, 'glow');
  const embers = Math.max(0, Math.min(24, Math.round(options.embers ?? 14)));
  for (let i = 0; i < embers; i++) {
    const at: [number, number, number] = [(next() - 0.5) * 0.4 * size, 0.15 * size, (next() - 0.5) * 0.4 * size], seed: [number, number, number] = [next(), next(), next()], e = 0.05 * size;
    add(card(e, e, 0, [at[0], at[1] - e / 2, at[2]], seed), M.ember, 'ember'); add(card(e, e, Math.PI / 2, [at[0], at[1] - e / 2, at[2]], seed), M.ember, 'ember');
  }
  const smoke = Math.max(0, Math.min(6, Math.round(options.smoke ?? 3)));
  for (let i = 0; i < smoke; i++) {
    const seed: [number, number, number] = [next(), next(), i / smoke], p = 0.7 * size;
    add(card(p, p, next() * Math.PI, [0, 0.9 * size, 0], seed), M.smoke, 'smoke');
  }
  return root;
}
