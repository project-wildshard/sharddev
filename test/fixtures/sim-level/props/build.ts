// oxlint-disable-next-line import/no-nodejs-modules -- The trusted fixture builder writes only its supplied artifact directory.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixture artifact paths are local build products.
import { join } from 'node:path';
import { templateProps } from '../../../../src/shards/_template/generators/templatePropsSource';
import { bakeProps } from '../../../../src/sharddev/bake/props';
import { bakeTerrain } from '../../../../src/sharddev/bake/terrain';
import { canonicalJson } from '../../../../src/sharddev/project';
import { emptyShardfile } from '../../../../src/sharddev/author';
import { validateProject } from '../../../../src/sharddev/project';
/** Generate the board's actual admitted bytes and the CLI-valid fixture shardfile, without shipping a template runtime. */
export function buildPropsFixture(directory: string, count = 10): void {
  mkdirSync(directory, { recursive: true });
  const fixture = templateProps(count), terrain = bakeTerrain({ heightAt: () => 0, colourAt: () => [0.2, 0.2, 0.2] }), result = bakeProps(fixture.source, terrain.tiles), assets = new Map([...terrain.assets, ...result.assets]);
  try {
    const shard = validateProject({ ...emptyShardfile({ slug: 'props-fixture', name: 'Props fixture', author: 'Test', revision: 1, seed: 357 }), tiles: result.tiles, files: [...terrain.files, ...result.files], far: result.far, library: result.library, terrain: terrain.terrain, critical: terrain.critical, edge: terrain.edge,
      budgets: { library: { resident: 100000, compressed: 100000 }, sim: { resident: 600000, compressed: 300000 }, overlap: 0 }, serverBudget: { tickMicros: 1000, memory: 600000, entities: 1, commandsPerTick: 1 } }, assets);
    for (const [hash, bytes] of assets) writeFileSync(join(directory, hash), bytes);
    writeFileSync(join(directory, 'shard.json'), canonicalJson(shard)); writeFileSync(join(directory, 'props.json'), canonicalJson(result.props)); writeFileSync(join(directory, 'report.json'), canonicalJson({ tiles: result.report, far: result.far, library: result.files.filter((f) => result.library.includes(f.hash)) }));
    writeFileSync(join(directory, 'checker.ktx2'), readFileSync('test/fixtures/sim-level/props/checker.ktx2'));
  } finally { fixture.dispose(); }
}
