export interface EntryStep { key?: string; label: string; ms: number }
export interface BootSpan { operation: string; ms: number }
export interface EntryState { entered: boolean; error: string | null; loading: string | null; steps?: EntryStep[]; spans?: BootSpan[] }
export interface Seen { errors: string[]; failed: string[]; crashed: () => boolean }
export function entryState(): EntryState;
export function watchPage(page: import('playwright').Page): Seen;
export function waitForEntry(page: { evaluate: (fn: typeof entryState) => Promise<EntryState> }, seen: Seen,
  options?: { timeout?: number; poll?: number; now?: () => number; sleep?: (ms: number) => Promise<void> }): Promise<EntryState & { steps: EntryStep[]; spans: BootSpan[]; seconds: number }>;
export function slowestSteps(steps: EntryStep[], count?: number): string;
export function slowestSpans(spans: BootSpan[], count?: number): string;
