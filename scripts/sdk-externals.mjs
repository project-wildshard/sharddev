/** Authoring objects and the SDK must share the caller's actual three.js constructors, not a bundled second copy. */
export const SDK_EXTERNALS = [/^node:/u, 'vite', 'sharp', 'binaryen', 'three', /^three\//u, /^assemblyscript(?:\/|$)/u];
