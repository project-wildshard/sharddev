// Jackal Den: a scene shard with a creature, from rows to a kill. `world.creature` turns a Group of named bones into
// the jackal's skinned body, its skin, its species and look rows, and the bite its ability names; `world.spawnAt`
// places two. Every player holds the starter sword, so the jackals can be fought and killed.
import * as THREE from 'three';
import { abilities, temperament } from '@wildshard/kit';
import { defineShard } from '@wildshard/sdk/scene/shard';

const bite = abilities.bite({ id: 'jackal.bite', damage: 9, range: 1.6 });
const { temperament: pursue, senses } = temperament.pursue({ aggro: 16, leash: 30 });

/** The jackal's body: a `body` bone carrying a `head` and a `tail` bone, a box on each (each mesh rides its bone). */
function jackalBody(): THREE.Group {
  const fur = new THREE.MeshStandardMaterial({ color: '#b08850' });
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group(), tail = new THREE.Group();
  body.name = 'body'; head.name = 'head'; tail.name = 'tail';
  body.position.set(0, 0.5, 0); head.position.set(0, 0.1, 0.5); tail.position.set(0, 0.05, -0.45);
  body.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.9), fur), head, tail);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.3), fur));
  tail.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.35), fur));
  root.add(body);
  return root;
}

/** A one-second clip that dips the head by `angle` radians and back: idle, walk and the bite's lunge. */
function nod(name: string, angle: number): THREE.AnimationClip {
  const dip = [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
  return new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.5, 1], [0, 0, 0, 1, ...dip, 0, 0, 0, 1])]);
}

export default defineShard({ slug: 'jackal-den', name: 'Jackal Den' }, (world) => {
  world.ground(() => 0, { colourAt: () => [0.7, 0.6, 0.4] });
  world.spawn(0, 1, 10, 0);
  world.creature('jackal', jackalBody(), {
    species: {
      kind: 'jackal', label: 'Dune jackal', type: 'beast', aggressive: true, lockable: true,
      dims: { bodyY: 0.5, bodyHalfLen: 0.45, bodyRadius: 0.22, headRadius: 0.12, legLen: 0.42, feet: [], halfWidth: 0.18 },
      variants: [{ id: 'tawny', label: 'Tawny jackal', rarity: 'common', weight: 1, scale: [0.9, 1.1], hp: 40,
        mods: { speed: 1, chargeDist: 1, damageTaken: 1, chargeDamage: 0, relentless: false } }],
      temperament: pursue, senses, abilities: [bite.ability],
    },
    strikes: [bite.strike],
    size: 'small',
    clips: [nod('idle', 0.1), nod('walk', 0.3), nod('attack', 0.6)],
    loops: ['idle', 'walk'],
    material: { family: 'pbr', vertexColours: true },
  });
  // a spawn faces its marker's +z: these two face the player, 22 m north of them
  for (const [index, x] of [-4, 4].entries()) {
    const den = new THREE.Object3D();
    den.position.set(x, 0, -12);
    world.scene.add(den);
    world.spawnAt(`jackal-${index + 1}`, den, { species: 'jackal', variant: 'tawny', brain: null, strike: null, seed: index + 1, scale: 1 });
  }
});
