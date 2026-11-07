/** Compile AssemblyScript 0.28.20 and structurally meter ABI-v0 bytecode using Binaryen 132.0.0. */
export function compileScript(source: string, options?: { maximumPages?: number; sources?: Readonly<Record<string, string>> }): Promise<Uint8Array>;
export function instrumentScript(bytes: Uint8Array): Uint8Array;
