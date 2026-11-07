import type { Scene } from 'three';
import type { SkyRig } from '@wildshard/engine/world/skyRig';
import type { Terrain } from '@wildshard/engine/world/Terrain';
import type { Forest } from '@wildshard/engine/world/forest/Forest';
import type { Physics } from '@wildshard/engine/physics/Physics';
import type { WorldRegistry, ColliderDesc } from '@wildshard/engine/world/registry';
import type { ModelPlacementVisitor } from '@wildshard/engine/models/model';
import type { ShardManifest } from '@wildshard/engine/game/shard/manifest';
import type { Tier } from '@wildshard/engine/core/tier';
import type { BakedGrid } from '@wildshard/engine/world/BakedTerrain';

/** Resources are borrowed only during capture; snapshot real geometry/placements before the host unloads. */
export interface AuthoredWorldCapture {
  scene: Scene; sky: SkyRig; forest: Forest;
  terrain: Pick<Terrain, 'mesh' | 'punch'>; physics: Physics; registry: WorldRegistry;
}
/** The CLI owns the inert DOM/fetch environment and a fresh sky. Geometry capture requires production terrain. */
export interface AuthoredWorldOptions {
  root: string; sky: SkyRig; element: () => HTMLElement;
  /** Match the shipping recipe's tier without creating a renderer. Defaults to desktop for navmesh. */
  tier?: Tier;
  /** Register the real engine practice room after the authored world, as the page does. */
  practiceArena?: boolean;
  /** Register native content rows during the real level.kit admission window. */
  installKit?: () => void | Promise<void>;
  /** Original WSTR payload; selected and installed before any terrain/forest/model reads. */
  nativeTerrain?: Uint8Array;
  createTerrain?: (input: { ground: Float32Array; forest: Forest; native: BakedGrid | null }) => Pick<Terrain, 'mesh' | 'punch'> | Promise<Pick<Terrain, 'mesh' | 'punch'>>;
  visitPlacement?: ModelPlacementVisitor;
  visit?: (world: AuthoredWorldCapture) => void | Promise<void>;
}
/** Execute the same owned authored world seam as the navmesh bake, then unload after capture or rejection. */
export function visitAuthoredWorld(def: ShardManifest, options: AuthoredWorldOptions): Promise<{
  colliders: ColliderDesc[]; ground: Float32Array | null; counts: Record<string, number>;
}>;
