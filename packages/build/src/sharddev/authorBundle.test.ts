// oxlint-disable-next-line import/no-nodejs-modules -- The native fixture owns its scratch.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Locate the owned fixture inputs.
import { resolve } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { executeBundle } from '@wildshard/sdk/executeBundle';
import { closeFixtures, fixtureRoot } from '@wildshard/sdk/internal/test/ownedScratch';
import { bundleAuthor } from './authorBundle';

afterAll(closeFixtures);

test('the Node author bundle folds an inactive browser sidecar and rejects an active extra module', async () => {
  const root = fixtureRoot('node-author-');
  try {
    mkdirSync(resolve(root, '.git'));
    writeFileSync(resolve(root, 'browser.ts'), 'throw new Error("Unexpected browser initialization"); export const value = 91;');
    writeFileSync(resolve(root, 'browser-entry.ts'), 'export const browserOnly = true;');
    writeFileSync(resolve(root, 'shard.config.ts'), `
export const profile = [typeof document, typeof window];
export async function generate() {
  if (typeof document !== 'undefined' || typeof window !== 'undefined') return (await import('./browser')).value;
  return 27;
}
`);
    const browser = resolve(root, 'browser.ts');
    const plugin: NonNullable<Parameters<typeof bundleAuthor>[2]> = [{
      name: 'browser-only-sidecar',
      load(id) {
        if (id === browser) this.emitFile({ type: 'chunk', id: resolve(root, 'browser-entry.ts') });
        return undefined;
      },
    }];
    const chunk = await bundleAuthor(root, 'shard.config.ts', plugin);
    expect(chunk.code).not.toContain('Unexpected browser initialization');
    const loaded: unknown = await executeBundle(chunk.code, root);
    if (typeof loaded !== 'object' || loaded === null) throw new Error('Missing native author exports');
    expect(Reflect.get(loaded, 'profile')).toEqual(['undefined', 'undefined']);
    const generate: unknown = Reflect.get(loaded, 'generate');
    if (typeof generate !== 'function') throw new Error('Missing native generator');
    expect(await Reflect.apply(generate, undefined, [])).toBe(27);
    writeFileSync(resolve(root, 'active.config.ts'), 'import { value } from "./browser"; export const active = value;');
    await expect(bundleAuthor(root, 'active.config.ts', plugin)).rejects.toThrow('config must bundle as one module');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
