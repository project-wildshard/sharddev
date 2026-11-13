import { expect, test, vi } from 'vitest';
import { BoxGeometry, Group, MeshBasicMaterial, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { parse } from 'valibot';
import { staticGlb } from './glb';
import { parseClientPlan } from '@wildshard/format/clientPlan';
import type { ShardContext } from '@wildshard/engine/game/shard/context';
import { Scope } from '@wildshard/engine/app/scope';
import { ToonLook } from '@wildshard/engine/render/families/toon';
import { emptyShardfile } from '../author';
import { createShardProduct } from '@wildshard/engine/game/shardfile/shardProduct';
import * as lookCompiler from '@wildshard/engine/game/shardfile/runtimeProduct';
import { lendLooks, lentLook, setLentTexture, type LentLooks } from '@wildshard/engine/game/shardfile/lentLooks';
import { installClientBakedTiles, lendBakedLooks, residentBakedTiles } from '@wildshard/engine/game/shardfile/bakedTiles';
import { parseFamilyMaterial } from '@wildshard/format/materialFamilies';
import { BakedTilesSchema, type BakedTilesRow } from '@wildshard/format/bakedTiles';

const lend = (id: string, material: MeshBasicMaterial, setTexture: LentLooks['setTexture']): Awaited<ReturnType<typeof lookCompiler.runtimeLookMaterials>> => ({
  materials: new Map([[id, material]]), setParam: () => undefined, setTexture, bindMeshMap: () => material,
  toon: new ToonLook(), textures: new Map<string, never>(), compile: () => material, tick: () => undefined, outline: () => [], surfaces: null,
  graphs: { bind: () => undefined, readout: { compiled: 0, fallback: 0, reasons: [] } },
});

// A data client may lend a graph look's presentation fallback first (graphs off): it takes no lent textures. The baked
// tiles host lends its own graph-compiled looks for its resident, so its lightmaps never reach the fallback (G532).
test('baked tiles lend their graph looks over an earlier presentation fallback', async () => {
  const source = emptyShardfile({ slug: 'fixture-orchard', name: 'Orchard', author: 'Fixture', revision: 1, seed: 3 });
  source.look.materials['orchard-ground'] = parseFamilyMaterial({ family: 'pbr' });
  const product = createShardProduct({ slug: source.identity.slug, revision: 1, shardfile: source, sections: new Map(), files: new Map(), read: () => Promise.reject(new Error('No fixture blob')) });
  const presentation = new Scope('presentation'), resident = new Scope('resident'), fallback = new MeshBasicMaterial(), compiled = new MeshBasicMaterial();
  const lent: string[] = [];
  lendLooks(presentation, lend('orchard-ground', fallback, () => { throw new Error('Material has no compiled graph textures'); }));
  const compile = vi.spyOn(lookCompiler, 'runtimeLookMaterials').mockResolvedValue(lend('orchard-ground', compiled, (_id, name) => { lent.push(name); }));
  const row = { look: 'orchard-ground', instances: null } as const satisfies Pick<BakedTilesRow, 'look' | 'instances'>;
  try {
    await lendBakedLooks({ game: {} as never, product }, [row as BakedTilesRow], resident);
    expect(compile).toHaveBeenCalledWith(expect.objectContaining({ scope: resident }), source, true, ['orchard-ground']);
    expect(lentLook('orchard-ground')).toBe(compiled);
    setLentTexture('orchard-ground', 'ao', new Texture());
    expect(lent).toEqual(['ao']);
    resident.dispose();
    expect(lentLook('orchard-ground')).toBe(fallback);
  } finally { compile.mockRestore(); presentation.dispose(); resident.dispose(); fallback.dispose(); compiled.dispose(); }
});

// G532 standalone and grid entry in one run. Standalone, the plan feature (the data client's scope) and the trusted runtime's
// world build (the resident's) both ask for the tiles in one world; in a grid the runtime's resident world asks first, on a
// second admitted product object of the same shard. Each world draws once and registers one bounce system, as a world's
// system registry refuses a duplicate id.
test('baked tiles draw once and tick once per world, standalone and grid entry', async () => {
  const source = emptyShardfile({ slug: 'fixture-reef', name: 'Reef', author: 'Fixture', revision: 1, seed: 4 });
  source.look.materials['reef-ground'] = parseFamilyMaterial({ family: 'pbr' });
  const glb = staticGlb([{ geometry: new BoxGeometry(), material: new MeshStandardMaterial(), name: 'ground_0_0' }]);
  const row = parse(BakedTilesSchema, { id: 'ground', glb: { file: 'world/ground.glb' }, tiles: { phone: 'ground_', desktop: 'ground_' }, look: 'reef-ground', drop: 0,
    meshPrefix: 'baked-', sky: false, toonDay: false, lightmaps: [], sun: null, instances: null });
  const plan = parseClientPlan({ version: 1, features: [{ kind: 'world.baked', rows: [row] }] });
  const product = () => createShardProduct({ slug: source.identity.slug, revision: 1, shardfile: source, sections: new Map([['client/plan', plan]]),
    files: new Map([['world/ground.glb', { hash: 'a'.repeat(64), url: '/fixture/ground.glb' }]]), read: () => Promise.resolve(glb) });
  const material = new MeshBasicMaterial();
  const page = () => {
    const ids = new Set<string>(), root = new Group(), app = {};
    const world = { sky: { setupMaterial: vi.fn(), csm: { lights: [] }, sunDir: new Vector3(0, 1, 0) }, registry: {} };
    const system = vi.fn<ShardContext['system']>((spec) => { if (ids.has(spec.id)) throw new Error(`Duplicate system id: ${spec.id}`); ids.add(spec.id); });
    const context = (scope: Scope): ShardContext => {
      const base: Pick<ShardContext, 'product' | 'scope' | 'root' | 'system'> = { product: product(), scope, root, system }, typed = base as ShardContext;
      // a data client and a trusted runtime see different world wrappers over the one app
      Object.defineProperty(typed, 'game', { enumerable: true, value: { runtime: { world: { ...world } } } });
      Object.defineProperty(typed, 'app', { enumerable: true, value: app });
      return typed;
    };
    return { root, system, context };
  };
  const compile = vi.spyOn(lookCompiler, 'runtimeLookMaterials').mockResolvedValue(lend('reef-ground', material, () => undefined));
  const scopes: Scope[] = [];
  const scope = (name: string): Scope => { const made = new Scope(name); scopes.push(made); return made; };
  try {
    // standalone: the data client's plan feature, then the runtime's world build, in one world
    const standalone = page(), data = scope('data'), resident = scope('resident');
    await installClientBakedTiles(standalone.context(data), { kind: 'world.baked', rows: [row] }, data);
    const drawn = await residentBakedTiles(standalone.context(resident), resident);
    expect(drawn.get('ground')?.tiles.map(tile => tile.name)).toEqual(['baked-ground_0_0']);
    expect(standalone.root.children).toHaveLength(1); expect(standalone.system).toHaveBeenCalledOnce();
    data.dispose(); resident.dispose();
    expect(standalone.root.children).toHaveLength(0);
    // grid: the resident world builds first, the entered plan phase follows on another product object
    const grid = page(), gridResident = scope('grid-resident'), entered = scope('entered');
    await residentBakedTiles(grid.context(gridResident), gridResident);
    await installClientBakedTiles(grid.context(entered), { kind: 'world.baked', rows: [row] }, entered);
    expect(grid.root.children).toHaveLength(1); expect(grid.system).toHaveBeenCalledOnce();
    // a re-entry after the entered scope left reuses the resident's draw and its one system
    entered.dispose();
    const again = scope('again');
    await installClientBakedTiles(grid.context(again), { kind: 'world.baked', rows: [row] }, again);
    expect(grid.root.children).toHaveLength(1); expect(grid.system).toHaveBeenCalledOnce();
    expect(compile).toHaveBeenCalledTimes(2);
  } finally { compile.mockRestore(); for (const made of scopes) made.dispose(); material.dispose(); }
});
