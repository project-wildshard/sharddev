import { afterEach, expect, it } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The fixture owns its generated output directory.
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixture paths stay inside the owned directory.
import { resolve } from 'node:path';
import { emptyShardfile } from '@wildshard/sdk/author';
import { admitProduct, readmitted } from './productOutput';
import { validateOutputProduct, writeOutputProduct } from './outputProduct';

// CI6: a writer skips its in-memory admission only for the very product admitProduct just returned, unchanged, with the
// same assets map, policy and script rows; anything else is admitted in full, and the written folder always is.
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const source = () => emptyShardfile({ slug: 'readmit-test', name: 'Readmit', author: 'Test', revision: 1, seed: 3 });

it('hands back only the unchanged object just admitted, with the same map, policy and scripts', () => {
  const assets = new Map<string, Uint8Array>(), product = admitProduct(source(), assets, 'warn');
  const again = readmitted(product, assets, 'warn', []);
  expect(again).not.toBeNull(); expect(again).not.toBe(product); expect(again).toEqual(product);
  // an equal copy is a different object: full admission
  expect(readmitted(structuredClone(product), assets, 'warn', [])).toBeNull();
  // another assets map or another policy: full admission
  expect(readmitted(product, new Map(), 'warn', [])).toBeNull();
  expect(readmitted(product, assets, 'refuse', [])).toBeNull();
  // a product that never went through admitProduct, or isn't an object
  expect(readmitted(source(), assets, 'warn', [])).toBeNull(); expect(readmitted(null, assets, 'warn', [])).toBeNull();
});

it('a product mutated after its admission is admitted again in full', () => {
  const assets = new Map<string, Uint8Array>(), product = admitProduct(source(), assets, 'warn');
  product.identity.name = 'Changed after admission';
  expect(readmitted(product, assets, 'warn', [])).toBeNull();
});

it('the writer still re-admits the folder it wrote, skipped middle admission or not', () => {
  mkdirSync('tmp', { recursive: true });
  const assets = new Map<string, Uint8Array>(), product = admitProduct(source(), assets, 'warn');
  const skipped = mkdtempSync(resolve('tmp', 'readmit-a-')), full = mkdtempSync(resolve('tmp', 'readmit-b-')); directories.push(skipped, full);
  const a = writeOutputProduct(product, assets, skipped), b = writeOutputProduct(structuredClone(product), assets, full);
  expect(a).toEqual(b);
  expect(validateOutputProduct(skipped).shard).toEqual(validateOutputProduct(full).shard);
});
