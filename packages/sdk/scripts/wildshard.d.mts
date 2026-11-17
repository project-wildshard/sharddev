/** Execute the same author CLI used by the packed SDK, bundled against the current workspace sources. */
export function runWildshard(args: readonly string[]): Promise<void>;

export function prepareWildshard():Promise<{code:string,modules:string[],reused:boolean}>;
