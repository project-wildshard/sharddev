// oxlint-disable-next-line import/no-nodejs-modules -- Native compiler fixture lives only in owned scratch.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Locate the owned fixture files.
import { resolve } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import type { PluginOption } from 'vite';
import { bundleAuthor } from './authorBundle';
import { executeBundle } from './executeBundle';
import { closeFixtures, fixtureRoot } from './test/ownedScratch';

afterAll(closeFixtures);

test('inlining an inactive browser branch never initializes it in a Node author', async () => {
  const root = fixtureRoot('node-author-');
  try {
    mkdirSync(resolve(root, '.git'));
    writeFileSync(resolve(root, 'browser.ts'), 'throw new Error("Browser initialization crossed the Node author boundary"); export const value = 91;');
    writeFileSync(resolve(root, 'shard.config.ts'), 'export const profile = typeof document; export async function generate() { if (typeof document !== "undefined") return (await import("./browser")).value; return 27; }');
    writeFileSync(resolve(root, 'browser-entry.ts'), 'export const browserOnly = true;');
    const plugins: PluginOption[] = [{ name: 'browser-only-sidecar', load(id: string): undefined {
      if (id === resolve(root, 'browser.ts')) this.emitFile({ type: 'chunk', id: resolve(root, 'browser-entry.ts') });
      return undefined;
    } }];
    const chunk = await bundleAuthor(root, 'shard.config.ts', plugins), loaded = await executeBundle(chunk.code, root);
    if (typeof loaded !== 'object' || loaded === null) throw new Error('Missing native author exports');
    expect(Reflect.get(loaded, 'profile')).toBe('undefined');
    const generate: unknown = Reflect.get(loaded, 'generate');
    if (typeof generate !== 'function') throw new Error('Missing native generator');
    const generated: unknown = await Reflect.apply(generate, undefined, []);
    expect(generated).toBe(27);
    writeFileSync(resolve(root, 'active.config.ts'), 'import { value } from "./browser"; export const active = value;');
    await expect(bundleAuthor(root, 'active.config.ts', plugins)).rejects.toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30_000);
