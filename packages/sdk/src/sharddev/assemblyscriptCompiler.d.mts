/** Resolve the pinned portable compiler without admitting its global declarations into host types. */
export function loadAssemblyScriptCompiler(): Promise<unknown>;

/** Resolve the pinned parser without its guest ambient declarations. */
export function loadAssemblyScriptParser(): Promise<unknown>;
