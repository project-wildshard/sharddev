import { assertConfigBoundary } from './configBoundary';
// oxlint-disable-next-line import/no-nodejs-modules -- Author inputs must remain within the project.
import { realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Author inputs must remain within the project.
import { resolve, sep } from 'node:path';
import { executeBundle } from './executeBundle';
import { bundle } from './bundle';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the defining reader into the same author bundle.
import { fileURLToPath } from 'node:url';
import type { Object3D } from 'three';
import { readScene, type SceneDescription } from './scene';
import { confined, publishScene, type SynthResult } from './bake';

/** Inspect an ordinary three.js graph and publish canonical scene.json, with an immutable content-hash copy.
 * Graph generation still executes on each synth; expensive producers use the verified native bake cache separately.
 * No client, rendering, physics service, wire-format admission or generated source file is involved. */
export function synthScene(scene: Object3D, project: string, slug: string): SynthResult {
  if (!/^[a-z][a-z0-9-]{0,127}$/u.test(slug)) throw new Error('Scene synth requires a bounded shard slug');
  return publishScene(readScene(scene), project, slug);
}
/** Execute a local author config in Node and synthesize its named scene and identity exports.
 * This transitional declaration composes real three.js objects; the existing default shardfile declaration is optional.
 * Only the scene reader's supported features enter JSON; missing scenes refuse instead of synthesizing a fake world. */
export async function synthProject(project: string): Promise<SynthResult> {
  const root = realpathSync(project), entry = confined(root, 'shard.config.ts');
  const three = import.meta.resolve('three'), reader = fileURLToPath(import.meta.resolve('@wildshard/sdk/scene'));
  // Reader and SDK declarations must share one module graph, not just the same three.js constructors.
  const virtual = resolve(root, '.wildshard-synth-entry.ts');
  const wrapper = `import * as input from ${JSON.stringify(entry)};
import { Object3D } from 'three';
import { readScene } from ${JSON.stringify(reader)};
if (!(input.scene instanceof Object3D)) throw new Error(typeof input.default?.describe === 'function'
  ? 'synth takes the older scene form (shard.config.ts exports scene, a three.js Scene, and identity); this one is a defineShard shard, which needs no synth: wildshard check . builds it and wildshard watch . shows it'
  : 'Scene config must export a real three.js scene (export const scene) and its identity (export const identity)');
if (typeof input.identity?.slug !== 'string') throw new Error('Scene config must export identity.slug');
export default { scene: readScene(input.scene), slug: input.identity.slug };`;
  const built = await bundle({ entry: virtual, fileName: 'scene', target: 'esnext', platform: 'node', external: [/^node:/u, 'assemblyscript/dist/asc.js'],
    plugins: [{ name: 'author-scene-three-identity', resolveId(id, importer) {
      if (id === virtual) return virtual;
      const author = importer?.startsWith(root + sep) === true && !importer.startsWith(resolve(root, 'node_modules') + sep);
      if (author && (/^@wildshard\/(?:game|engine)\//u.test(id) || /^@wildshard\/(?:sdk|sharddev)\/runtime\//u.test(id))) throw new Error('Scene synth cannot import trusted runtime');
      return id === 'three' ? { id: three, external: true } : null;
    }, load(id) {
      if (id === virtual) return wrapper;
      const file = id.split('?')[0] ?? id;
      if (!file.startsWith(root + sep)) return null;
      const relative = file.slice(root.length + 1).split(sep).join('/');
      if (relative.startsWith('node_modules/')) return null;
      if (relative !== 'shard.config.ts' && !/^(?:generators|data|quests|assets|behaviour|blender)\//u.test(relative)) throw new Error('Scene synth source is outside authoring folders');
      if (realpathSync(file) !== file) throw new Error('Scene synth author source must not be a symlink');
      return null;
    } }],
  });
  const chunks = built.output.filter(output => output.type === 'chunk'), chunk = chunks[0];
  if (chunks.length !== 1 || chunk === undefined) throw new Error('Scene config must compile as one module');
  assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports]);
  const loaded: unknown = await executeBundle(chunk.code, root);
  if (typeof loaded !== 'object' || loaded === null || !('default' in loaded)) throw new Error('Scene config produced no reader result');
  const data = loaded.default;
  if (typeof data !== 'object' || data === null || !('slug' in data) || typeof data.slug !== 'string'
    || !('scene' in data) || typeof data.scene !== 'object' || data.scene === null || !('version' in data.scene) || data.scene.version !== 1) throw new Error('Invalid scene reader result');
  // Only the defining readScene inside this trusted author bundle creates this result. Wire admission is separate.
  return publishScene(data.scene as SceneDescription, root, data.slug);
}
