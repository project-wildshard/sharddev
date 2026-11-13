// oxlint-disable-next-line import/no-nodejs-modules -- Explicit Node publication retains the existing confined file writes.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Published paths stay under the author project.
import { dirname, resolve, sep } from 'node:path';
import { encodeCanonicalJson, hashImmutableBytes } from './immutable';
import type { SceneDescription } from './scene';
import type { SynthResult } from './bake';

/** A path under the author project, refused when it (or its nearest existing parent) resolves outside it. */
export function confinedScenePath(root: string, path: string): string {
  const destination = resolve(root, path);
  let existing = destination;
  while (!existsSync(existing)) existing = dirname(existing);
  const actual = realpathSync(existing);
  if (actual !== root && !actual.startsWith(root + sep)) throw new Error('Scene synth path resolves outside project');
  return destination;
}

/** Publish an already-read description as canonical scene.json (and its content-hash copy); `synth` and `bake` both write through it. */
export function publishSceneDescription(description: SceneDescription, project: string, slug: string): SynthResult {
  if (!/^[a-z][a-z0-9-]{0,127}$/u.test(slug)) throw new Error('Scene synth requires a bounded shard slug');
  const root = realpathSync(project);
  const bytes = new TextEncoder().encode(encodeCanonicalJson(description)), hash = hashImmutableBytes(bytes);
  const cache = `.wildshard/cache/${slug}`, immutable = confinedScenePath(root, `${cache}/${hash}/scene.json`);
  const path = confinedScenePath(root, `${cache}/scene.json`);
  if (existsSync(immutable)) {
    if (hashImmutableBytes(readFileSync(immutable)) !== hash) throw new Error('Scene synth cached bytes disagree with their content hash');
  } else { mkdirSync(dirname(immutable), { recursive: true }); writeFileSync(immutable, bytes, { flag: 'wx' }); }
  writeFileSync(path, bytes);
  return { scene: description, hash, path };
}
