export interface EntryState { entered: boolean; error: string | null; loading: string | null }
export interface Seen { errors: string[]; failed: string[]; crashed: () => boolean }
export function entryState(): EntryState;
export function watchPage(page: import('playwright').Page): Seen;
export function waitForEntry(page: { evaluate: (fn: typeof entryState) => Promise<EntryState> }, seen: Seen,
  options?: { timeout?: number; poll?: number; now?: () => number; sleep?: (ms: number) => Promise<void> }): Promise<EntryState>;
