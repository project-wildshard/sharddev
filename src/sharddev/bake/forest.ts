import { canopyMapOf, placeForest, type ForestPlacementSource, type PlantSpec } from '@wildshard/engine/world/forest/placement';
import { buildTerrainMetadata } from '@wildshard/engine/world/terrainField';
import type { ForestSpec, TerrainSpec } from '@wildshard/engine/level/data';
import { readNativeTerrain } from './terrain';
import { TreeSetSchema } from '@wildshard/format/treeSetRows';
import { ManifestMetadataSchema } from '@wildshard/format/minimap';
import * as v from 'valibot';
import { TREE_SPECS } from '@wildshard/engine/world/forest/treeSpec';

/** Native ordered default tree geometry traits used by forest placement. */
export function forestDefaultTreeSpecs(): typeof TREE_SPECS { return TREE_SPECS; }

/** Ordered planting traits accepted by the native forest placement law. */
export type NativeForestSpecies = NonNullable<NonNullable<ForestPlacementSource['forest']>['speciesTraits']>[number];

/** Admit an authored tree pool, material slots and ordered variants before publication. */
export function treeSetRows(input: unknown): v.InferOutput<typeof TreeSetSchema> { return v.parse(TreeSetSchema, input); }

/** Owned native tree data; no live color, scene or geometry object enters an author result. */
export interface NativeForestTree {
  readonly x: number; readonly y: number; readonly z: number; readonly r: number;
  readonly variant: number; readonly scale: number; readonly rot: number; readonly height: number;
  readonly species?: string;
  readonly tint: readonly [number, number, number];
}

/** A build's ordered trees and the original padded trunk query over those same owned records. */
export interface NativeForestPlacements {
  readonly trees: readonly NativeForestTree[];
  readonly nearby: (x: number, z: number, radius?: number) => readonly NativeForestTree[];
}

/** Bake the existing forest algorithm from trusted explicit policy and native samplers.
 * Return detached numeric records with stable query identity; never select a page or install terrain.
 * The caller owns the result and includes every supplied policy/sampler in its native source cache key. */
export function bakeForestPlacements(source: ForestPlacementSource, variants: readonly PlantSpec[]): NativeForestPlacements {
  const native = placeForest(variants, source), trees: NativeForestTree[] = [];
  const owned = new Map<(typeof native.trees)[number], NativeForestTree>();
  for (const tree of native.trees) {
    const { tint, species, ...data } = tree;
    const row: NativeForestTree = { ...data, ...(species === undefined ? {} : { species }), tint: [tint.r, tint.g, tint.b] };
    trees.push(row); owned.set(tree, row);
  }
  return { trees, nearby: (x, z, radius = 2) => native.grid.nearby(x, z, radius).map(tree => {
    const row = owned.get(tree);
    if (row === undefined) throw new Error('Native forest query lost its owned tree');
    return row;
  }) };
}

/** A native terrain's trail, cabin, pond and water queries from explicit trails, cabin sites and water level: the page's
 *  terrain law over those inputs, for a forest bake's source (`bakeForestPlacements`). No level is selected or installed. */
export function nativeTerrainQueries(seed: number, spec: Parameters<typeof buildTerrainMetadata>[1],
  waterLevel: Parameters<typeof buildTerrainMetadata>[2]): ReturnType<typeof buildTerrainMetadata> {
  return buildTerrainMetadata(seed, spec, waterLevel);
}

/** One declared forest candidate (a shard's forest rows, G4): its exact jittered lattice point and what it answers. */
export interface PlantedForestCandidate {
  readonly x: number; readonly z: number; readonly density: number; readonly scale: number;
  readonly species: Readonly<Partial<Record<string, number>>>;
}
/** The declared ground a forest avoids: its trails, cabin pads and pond (a shard's ground rows), and its still water. */
export type PlantedForestGround = Pick<TerrainSpec, 'trails' | 'cabinSites' | 'pond'> & { readonly seed: number; readonly water: number; readonly datum?: number };
/** Everything a page plants its forest from, as data: no level is selected and no terrain installed. */
export interface PlantedForestInput {
  readonly seed: number; readonly treeCount: number;
  /** the manifest's forest policy as authored (`manifest.json` `forest`; its queries come from `candidates`) */
  readonly forest: unknown;
  readonly candidates: readonly PlantedForestCandidate[];
  readonly ground: PlantedForestGround;
  /** the retained baked terrain (WSTR) the page installs */
  readonly terrain: Uint8Array;
  readonly variants: readonly PlantSpec[];
}

/** G32: the forest a page plants (`placeForest(plantSpecs(def.trees))` on its installed level), from data. Heights and
 *  normals are the retained bake's (plus the ground's datum, as the installed field adds it); the trail, cabin and pond
 *  masks are the terrain field's own (`buildTerrainMetadata`); each candidate answers its declared density, scale and
 *  species. A program reaches the planted trees without the level registry or any runtime module. */
/** A planted forest: its trees and their nearby query, and the canopy channel a splat ground darkens under (256², 0–1). */
export interface PlantedForest extends NativeForestPlacements { readonly canopy: Float32Array }
export function bakePlantedForest(input: PlantedForestInput): PlantedForest {
  const baked = readNativeTerrain(input.terrain), datum = input.ground.datum ?? 0, ground = input.ground;
  const policy: Omit<ForestSpec, 'density' | 'scale' | 'species'> = v.parse(ManifestMetadataSchema.entries.forest.wrapped, input.forest);
  const masks = buildTerrainMetadata(ground.seed, { trails: ground.trails, cabinSites: ground.cabinSites, ...(ground.pond === undefined ? {} : { pond: ground.pond }) }, () => ground.water);
  const at = new Map(input.candidates.map(row => [`${String(row.x)},${String(row.z)}`, row]));
  const row = (x: number, z: number): PlantedForestCandidate => {
    const found = at.get(`${String(x)},${String(z)}`);
    if (found === undefined) throw new Error('Forest candidate differs from its declared rows');
    return found;
  };
  const planted = bakeForestPlacements({
    seed: input.seed, treeCount: input.treeCount,
    heightAt: datum === 0 ? baked.heightAt : (x, z) => baked.heightAt(x, z) + datum, normalAt: baked.normalAt,
    trailDistance: masks.trailDistance, cabinMask: masks.cabinMask, pondMask: masks.pondMask,
    forest: { ...policy, density: (x, z) => row(x, z).density, scale: (x, z) => row(x, z).scale, species: (x, z) => ({ ...row(x, z).species }) },
  }, input.variants);
  return { ...planted, canopy: canopyMapOf(planted.trees) };
}
