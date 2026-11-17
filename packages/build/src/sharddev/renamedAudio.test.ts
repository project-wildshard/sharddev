// oxlint-disable-next-line import/no-nodejs-modules -- AU21: the check reads a built product's sections on disk
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- the product is a scratch folder
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- the product is a scratch folder
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

// AUDIO AU21 (moved from the sdk's audioEncode.test.ts with project.ts, SDK-SPLIT SP9c).
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function folder(): string { const root = mkdtempSync(join(tmpdir(), 'sharddev-audio-')); roots.push(root); return root; }

it('refuses a built product that still names a renamed recording', async () => {
  const { assertNoRenamedAudioNames } = await import('./project');
  const product = folder(), renamed = new Map([['/assets/sfx/test/hit-0123abcd.m4a', '/assets/sfx/test/hit-89abcdef.m4a']]);
  mkdirSync(join(product, 'sections'), { recursive: true });
  writeFileSync(join(product, 'sections', 'ok.json'), JSON.stringify({ file: 'hit-89abcdef.m4a' }));
  writeFileSync(join(product, 'hit-0123abcd.m4a'), 'a recording is not read');
  expect(() => assertNoRenamedAudioNames(product, renamed)).not.toThrow();
  writeFileSync(join(product, 'sections', 'stale.json'), JSON.stringify({ file: 'hit-0123abcd.m4a' }));
  expect(() => assertNoRenamedAudioNames(product, renamed)).toThrow('sections/stale.json names /assets/sfx/test/hit-0123abcd.m4a, which the build serves as /assets/sfx/test/hit-89abcdef.m4a (AU21)');
});
