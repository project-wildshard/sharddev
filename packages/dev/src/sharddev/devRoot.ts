// SDK-SPLIT SP8c: @wildshard/dev's root. A top-level file, so the bundled CLI (which gives every module of a package its
// package's src/sharddev as import.meta.dirname) and an unbundled run agree; a file in a subfolder imports this.
// oxlint-disable-next-line import/no-nodejs-modules -- the package root is a filesystem path.
import { resolve } from 'node:path';

export const DEV_ROOT: string = resolve(import.meta.dirname, '../..');
