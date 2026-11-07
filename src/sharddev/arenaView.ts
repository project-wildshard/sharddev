import { ARENA_VIEW as view, arenaFunnel as funnel, arenaChainTell as chainTell } from '@wildshard/format/arenaView';
import type { ArenaWhirlsRows as Whirls } from '@wildshard/format/encounterRows';
import type { ViewProgramRows } from '@wildshard/format/viewProgram';

/** Complete native view-bank declaration before a scoped runtime host is installed. */
export type AuthorViewProgramRows = ViewProgramRows;

/** Fixed numeric arena presentation defaults shared with the runtime's declared view host. */
export const ARENA_VIEW: typeof view = view;
/** Admitted numeric arena whirl metadata; no live view or fight bindings. */
export type ArenaWhirlsRows = Whirls;
/** Construct the defining arena funnel rows without installing a rendering service. */
export function arenaFunnel(...args: Parameters<typeof funnel>): ReturnType<typeof funnel> { return funnel(...args); }
/** Resolve the defining arena chain's tell label in original ordinal order. */
export function arenaChainTell(index: number): string { return chainTell(index); }
