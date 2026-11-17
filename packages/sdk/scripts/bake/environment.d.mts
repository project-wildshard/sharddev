/** The same non-drawing DOM and public/file fetch adapter used by the navmesh CLI; no installation on import. */
export function installBakeEnvironment(root: string): { element: () => HTMLElement; dispose: () => void };
