/** Build every live first-party product with its charged immutable map, enforcing recorded raster and world freshness.
 * `reuse` keeps a product whose content key is unchanged; `only` builds just those shards.
 * `copyRuntime` proves selected runtime copies without changing discovery. */
export function buildShardfiles(root: string, options?: { strict?: boolean; build?: (args: string[]) => Promise<void>; reuse?: boolean; only?: string[]; /** Explicit generation phase scope, also enforced in strict builds. */ scope?: string[]; copyRuntime?: boolean | 'closed'; onFailure?:(slug:string,error:unknown)=>void }): Promise<number>;

/** Read CI's built output or a content-key-matching local product; never runs a producer or build. */
export function readBuiltShardfile(root: string, name: string, options?: { cacheRoot?: string; env?: NodeJS.ProcessEnv }): string;
