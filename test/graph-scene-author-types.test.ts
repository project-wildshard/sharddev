import type { GraphIr, GraphNode, GraphRef, GraphParam } from '@wildshard/format/materialGraph';
import type { PostGraphLookRow } from '@wildshard/format/postGraphLook';
import type { WorldSceneModels } from '@wildshard/format/worldSceneModels';
import type { SpawnTables } from '@wildshard/format/spawnTables';
import type { ExchangeRows } from '@wildshard/format/exchange';
import type { AuthorGraph, AuthorGraphNode, AuthorGraphRef, AuthorGraphParam, AuthorPostGraphLook } from '@wildshard/sharddev/bake/materialGraph';
import type { worldSceneModels } from '@wildshard/sharddev/worldScenes';
import type { AuthorSpawnTables } from '@wildshard/sharddev/spawns';
import type { AuthorExchangeRows } from '@wildshard/sharddev/rows';
import { expectTypeOf, test } from 'vitest';

test('the public author graph, scene, spawn and exchange types match format exactly', () => {
  expectTypeOf<AuthorGraph>().toEqualTypeOf<GraphIr>();
  expectTypeOf<AuthorGraphNode>().toEqualTypeOf<GraphNode>();
  expectTypeOf<AuthorGraphRef>().toEqualTypeOf<GraphRef>();
  expectTypeOf<AuthorGraphParam>().toEqualTypeOf<GraphParam>();
  expectTypeOf<AuthorPostGraphLook>().toEqualTypeOf<PostGraphLookRow>();
  expectTypeOf<ReturnType<typeof worldSceneModels>>().toEqualTypeOf<WorldSceneModels>();
  expectTypeOf<AuthorSpawnTables>().toEqualTypeOf<SpawnTables>();
  expectTypeOf<AuthorExchangeRows>().toEqualTypeOf<ExchangeRows>();
});
