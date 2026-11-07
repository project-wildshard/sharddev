import { expectTypeOf, test } from 'vitest';
import type { modelSceneSourceFile, bakedSceneSourceFile } from '../src/sharddev/worldScenes';
import type { readManifestSource } from '../src/sharddev/projectManifest';
import type { RigLibraryRows, ModelSpecimenRow, ModelLibraryRows } from '../src/client/game/plugin/geometry';
import type { BakedColliderInput, WorldPieceRow } from '../src/client/game/shardfile/bakedKinds';
import type { ChunkHorizon } from '../src/client/game/shard/manifest';
import type { skyRigLibrary } from '../src/shards/far-reach/generators/rigLibrary';
import type { BakedPiece } from '../src/shards/far-reach/generators/fileInventory';
import type { UniformRows } from '../src/client/game/plugin/shaderFamily';
import type { DUNE_MODELS, DuneMeshName, DuneHdName } from '../src/shards/sunscar-dunes/generators/rows/files';
import type { CardRow } from '../src/shards/sunscar-dunes/generators/rows/fireCards';

test('source emitter ports retain complete native rigs, specimens, contacts and generic world rows', () => {
  type Models = Parameters<typeof modelSceneSourceFile>[1];
  type Placements = NonNullable<Parameters<typeof bakedSceneSourceFile>[1]['placements']>;
  type World = Placements['rows'][number];
  type Restricted = Omit<World, 'baked'> & { readonly baked?: BakedPiece };
  expectTypeOf<NonNullable<Models['rows']['rigs']>>().toEqualTypeOf<RigLibraryRows>();
  expectTypeOf<ReturnType<typeof skyRigLibrary>>().toEqualTypeOf<RigLibraryRows>();
  expectTypeOf<NonNullable<Models['specimens']>[number]>().toEqualTypeOf<ModelSpecimenRow>();
  expectTypeOf<NonNullable<Placements['colliders']>[number]['colliders'][number]>().toEqualTypeOf<BakedColliderInput>();
  expectTypeOf<World>().toEqualTypeOf<WorldPieceRow>();
  expectTypeOf<Restricted extends WorldPieceRow<BakedPiece> ? true : false>().toEqualTypeOf<true>();
  expectTypeOf<WorldPieceRow<BakedPiece> extends Restricted ? true : false>().toEqualTypeOf<true>();
});

test('horizon ports retain all mutable native ring and band fields', () => {
  expectTypeOf<NonNullable<Awaited<ReturnType<typeof readManifestSource>>['authored']['horizon']>>().toEqualTypeOf<ChunkHorizon>();
});



test('Sunscar model and card ports retain every native key, uniform variant and ownership qualifier', () => {
  type NativeLibrary = ModelLibraryRows<DuneMeshName, DuneHdName>;
  expectTypeOf<typeof DUNE_MODELS extends NativeLibrary ? true : false>().toEqualTypeOf<true>();
  expectTypeOf<NativeLibrary extends typeof DUNE_MODELS ? true : false>().toEqualTypeOf<true>();
  expectTypeOf<NonNullable<CardRow['uniforms']>>().toEqualTypeOf<UniformRows>();
  expectTypeOf<typeof DUNE_MODELS.meshes[number]>().toEqualTypeOf<DuneMeshName>();
  expectTypeOf<keyof typeof DUNE_MODELS.hdLooks>().toEqualTypeOf<DuneHdName>();
});
