// SHARD-COMPAT SI5: the types of `@wildshard/sdk/headless` (index.mjs), so a strict shard typecheck reads the engine's
// pin, folder and require through the sdk.
/* oxlint-disable unicorn/filename-case -- the declaration file sits beside index.mjs */

/** The engine's `package.json`, as the sdk resolves its peer (the shard's own engine). */
export declare const enginePackagePath: string;
/** `enginePackagePath` as a URL, for `createRequire` and `new URL` callers. */
export declare const enginePackageUrl: string;
/** The engine's installed folder. */
export declare const engineRoot: string;
/** The engine's version: the pin this shard runs on. */
export declare const enginePin: string;
/** A require from the engine's folder. */
export declare const engineRequire: NodeJS.Require;
