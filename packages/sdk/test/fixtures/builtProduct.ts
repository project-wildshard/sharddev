// oxlint-disable-next-line import/no-nodejs-modules -- The consumer's build root owns its published products.
import { resolve } from 'node:path';
import { readBuiltShardfile } from '@wildshard/engine/scripts/built-folder.mjs';

/** Read the consumer's normal build or immutable cache; never build during a test. */
export function builtProduct(name: string): string { return readBuiltShardfile(resolve('.'), name); }
