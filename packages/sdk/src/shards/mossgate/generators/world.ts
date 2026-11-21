// Mossgate Hollow, whole, as three.js source (SHARD-SOURCE AP15): the cleanroom's src/world.js and the light of its
// src/main.js (mossgate-cleanroom 9cb4dc6), ported section by section. The geometry, materials and lights are the
// cleanroom's own lines. What changed, as in the authoring slice (AP7): each section is a `world.part` with its own seeded
// stream (editing the hut never reshuffles the trees), each `colliders.push` box is an invisible `solid` box at the same
// numbers, the pond's Reflector is a `Water`, the canvas painters run at compile time, `update(t)` is said once with
// `animate`, the instanced glow billboard (an `onBeforeCompile` patch) is one additive Sprite per halo, and the phone
// LODs and static merge are the engine's (AP8). The quest state is fixed: brazier A lit, the gate shut, the bridge sunk,
// the Warden idle. TEMPLATE-E2E TR-12 made it live (play.ts): the braziers start cold, and their flames, the gate's bars
// and the pond's stones are panels their fields show.
import * as THREE from 'three';
import { sunsetSky } from './sky';
import type { ShardWorld } from '@wildshard/sdk/scene/author';
import { LAYOUT, groundHeight, groundColour } from './hollow';
import { materials, resetKit } from './kit';
import { walls, paths, braziers, hut, crate, signpost, gate, lamplighter } from './yard';
import { pond, trees, boulders, flora, grass, fireflies } from './garden';
import { arena } from './ring';

/** The sunset light (cleanroom main.js 40-66): the painted sky, hemisphere, the key sun, the rim, the haze, the composer. */
export function sunset(world: ShardWorld): void {
  // the sky dome (cleanroom sky.js) and the environment PMREM'd from it at 0.4 (main.js 63-70); under the skyline the
  // cleanroom's environment sees the dome's haze, so the ground the engine filters with is that haze
  const haze = new THREE.Color('#ffb878').multiplyScalar(0.92);
  world.sky(sunsetSky(), { environment: { intensity: 0.4, ground: [haze.r, haze.g, haze.b] } });
  world.scene.fog = new THREE.FogExp2(new THREE.Color('#d898a0'), 0.0062);
  world.part('light', (part) => {
    part.add(new THREE.HemisphereLight(new THREE.Color('#c4b0e4'), new THREE.Color('#7a6a3c'), 0.85));
    const key = new THREE.DirectionalLight(new THREE.Color('#ffd6ae'), 2.2);
    key.position.set(-26, 30, 34); key.castShadow = true;
    part.add(key, key.target);
    const rim = new THREE.DirectionalLight(new THREE.Color('#ff9a80'), 1.2);
    rim.position.set(14, 5, -40);
    part.add(rim);
  });
  world.post({ tone: 'aces', exposure: 1.05, bloom: { strength: 0.42, radius: 0.55, threshold: 0.9 }, vignette: 0.2 });
}

/** Mossgate Hollow: the light, the ground and every section of the cleanroom, one part each. */
export function buildMossgate(world: ShardWorld): void {
  // a fresh build (watch runs it on every save) makes its own shared materials
  resetKit();
  const { M, tex } = materials();
  sunset(world);
  // the cleanroom's ground mesh: MeshStandardMaterial({ map: moss, vertexColors: true, roughness: 0.97 }); its moss map's
  // clumps (4 m a tile, blotches about a quarter metre across, fine speckle) as the PBR detail layer
  world.ground(groundHeight, { colourAt: groundColour, material: new THREE.MeshStandardMaterial({ roughness: 0.97 }), detail: { scale: 0.35, mottle: 0.3, grain: 0.15, relief: 0.5 } });
  world.part('walls', (part) => { walls(part, M, tex); });
  world.part('paths', (part) => { paths(part, M); });
  world.part('braziers', (part) => { braziers(part, M, tex); });
  world.part('hut', (part) => {
    hut(part, M, tex);
    // TR-2: the starter quest's place, a step out from the hut door (quests.ts); its trigger row reads this node
    const door = new THREE.Object3D(); door.name = 'hut-door'; door.position.set(LAYOUT.HUT.x, 0, LAYOUT.HUT.z + LAYOUT.HUT.d / 2 + 1); part.add(door);
    world.trigger('hut.door', door, { radius: 2.5 });
  });
  world.part('sign', (part) => { signpost(part, M, tex); });
  world.part('crate', (part) => { crate(part, M); }, { panel: 'mossgate.crate', touchable: { material: 'wood', density: 250 } });
  world.part('gate', (part) => { gate(part, M, tex); });
  // TR-12: her figure is the panel her talk names (gameplay.ts)
  const figure = world.part('lamplighter-figure', () => undefined, { panel: 'mossgate.lamplighter' });
  world.part('lamplighter', (part) => { lamplighter(part, M, tex, figure); });
  world.part('pond', (part) => { pond(part, M, tex); });
  world.part('arena', (part) => { arena(part, M, tex); });
  world.part('trees', (part) => { trees(part, M, tex); });
  world.part('boulders', (part) => { boulders(part, M, tex); });
  world.part('flora', (part) => { flora(part, tex, world); });
  grass(world, tex);
  world.part('fireflies', (part) => { fireflies(part, tex); });
  // MZ23: the engine's piano score, pine by day, island by night and the title theme while the Warden fights (engine
  // 30c22f00 and 756b6dba, in 0.1.59 and up), and a low wind through the hollow, so a quest step's sting is heard (MZ31)
  world.music({ day: 'pine', night: 'island', boss: 'title' });
  world.ambience({ winds: [{ frequency: 260, q: 0.5, pan: -0.55, rate: 0.07, gain: 0.08 }, { frequency: 520, q: 0.9, pan: 0.5, rate: 0.11, gain: 0.04 }] });
  world.spawn(LAYOUT.SPAWN.x, 0, LAYOUT.SPAWN.z, LAYOUT.SPAWN.yaw);
}
