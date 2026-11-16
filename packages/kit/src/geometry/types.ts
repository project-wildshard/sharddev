import type { Rng } from '@wildshard/sdk/random'
import type * as THREE from 'three'

/** A geometry recipe's palette and shape knobs, without simulation or runtime owners. */
export interface VariantDef {
  id: string
  label: string
  weight: number
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary'
  scale: [number, number]
  tint?: Record<string, [number, number, number]>
  fur?: Partial<FurStyle>
  traits?: Record<string, number | boolean | string>
}
/** One authored joint in model space. */
export interface BoneDef {
  name: string
  parent: string | null
  pos: [number, number, number]
}
/** Data-only dimensions accompanying the baked skin. */
export interface AnimalDims {
  /** height of the body bone (spine centre) above ground in the bind pose */
  bodyY: number
  /** half-length of the body capsule along Z (for hit tests) */
  bodyHalfLen: number
  /** radius of the body capsule */
  bodyRadius: number
  /** head hit-sphere radius */
  headRadius: number
  /** rest length of the front leg (shoulder → hoof) — drives stride frequency */
  legLen: number
  /** foot rest positions (x, z) per leg FL, FR, BL, BR */
  feet: [number, number][]
  /** width of the body (for the corpse's resting height when rolled on its side) */
  halfWidth: number
  /** body hit-capsule axis: 'z' (default, along the spine of a quadruped) or 'y' (upright: the Drowned Sailor) */
  capsuleAxis?: 'z' | 'y'
  /** the head ball's centre, head-bone local (model units); default the joint itself. A hull whose skull sits off its head
   *  joint (the Antler King, E350 F-X2) moves the ball onto it */
  headAt?: readonly [number, number, number]
  /** the body capsule's centre, body-bone local (model units; default the joint), and its axis tilted `bodyPitch` rad from
   *  the bone's z toward its y (+ = the front up) — a 'z' capsule only */
  bodyAt?: readonly [number, number, number]
  bodyPitch?: number
  /** a second body capsule across `bone`'s x axis (the Antler King's shoulders and chest, E350 F-X2): centre (bone local,
   *  model units), half-length along x and radius. Its hits are body hits */
  fore?: {
    readonly bone: string
    readonly at: readonly [number, number, number]
    readonly halfLen: number
    readonly radius: number
  }
}
/** Owned, unmerged body parts produced offline. */
export interface AnimalSpecies {
  bones: BoneDef[]
  /** geometries drawn with the fur material + fur shells (loft() output: has color / skin / furLen attributes) */
  furParts: THREE.BufferGeometry[]
  /** hard parts: hooves, antlers, tusks, snout (no fur shells, vertex colours only) */
  hardParts: THREE.BufferGeometry[]
  /** eye spheres (glossy clearcoat material) */
  eyeParts: THREE.BufferGeometry[]
  dims: AnimalDims
  /** low-poly style: a base-colour texture on the rig's material (a generated model's own paint, e.g. the Drowned
   *  Captain); the vertex colours multiply it, so textured parts carry white */
  map?: THREE.Texture
  /** low-poly style: the per-facet lightness jitter (lowpoly.ts facetGeometry, default 0.12) — 0 for a textured model */
  facetJitter?: number
  /** low-poly style, with `map`: the texture fed back as emissive at this intensity, so a painted model keeps its colours
   *  in shade (the flat toon fill alone left the captain's navy coat near-black) */
  selfLight?: number
}

export interface FurStyle {
  /** seed + parameters of the tileable strand albedo / normal texture (baked as fur-<kind>-{map,normal}) */
  texSeed: number
  tex: {
    contrast: number
    grizzle: number
    normalStrength: number
    bristle: number
    strandLen: number
    root: number
  }
  roughness: number
  sheen: number
  sheenColor: [number, number, number]
  envMapIntensity: number
  /** backlit Fresnel tip colour (linear rgb) */
  rim: [number, number, number]
  /** metres the outermost fur shell stands off the skin for furLen = 1 */
  shellLen: number
  /** metres of noise displacement on the body/neck/head silhouette (shaggy coat); 0 = smooth */
  shag: number
  /** optional self-glow (linear rgb × intensity) — the Ghost stag uses it */
  emissive?: [number, number, number]
  emissiveIntensity?: number
}

/** Build-time look content with no live creature owner. */
export interface CommonLook {
  id: string
  species: string
  kind: string
  rigContract: { skeleton: string; clips: string[]; sockets: string[] }
  fur: FurStyle
  pose?: { grazeNeck: number; gallopTail: number }
  variants?: Readonly<
    Record<string, Pick<VariantDef, 'tint' | 'fur' | 'traits'>>
  >
  build: (variant: VariantDef, rng: Rng) => AnimalSpecies
}
