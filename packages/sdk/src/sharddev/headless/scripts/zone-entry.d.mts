// CHUNK-PARAM-REMOVAL CP20: the types of `@wildshard/sdk/headless/scripts/zone-entry.mjs`, the engine's enterZone.
import type { Page } from 'playwright';

type Mode = 'enter' | 'explore' | 'arena';
interface Catalogue { placements?: { slug: string }[]; grid?: { cells?: { slug: string }[] } }
/** The game's save prefix (epoch 2). */
export declare const SAVE_PREFIX: string;
/** Enter `zone` like a player: the tap in the tab, then `/`; `alone` serves a one-cell world of it instead. */
export declare function enterZone<P extends Page>(page: P, options: {
  zone: string; base?: string; flags?: string | Record<string, string>; mode?: Mode; name?: string; alone?: boolean;
  prefix?: string; waitUntil?: 'load' | 'domcontentloaded' | 'commit'; timeout?: number;
}): Promise<P>;
/** A script that writes the tap into this origin's tab (agent-browser, the WebKit inspector); then open `/`. */
export declare function initScript(zone: string, mode?: Mode, prefix?: string): string;
/** The build's catalogue with only `zone`'s cell. */
export declare function oneCellCatalogue<C extends Catalogue>(catalogue: C, zone: string): C;
/** `/`'s HTML with its inline catalogue cut to `zone`'s one cell. */
export declare function oneCellPage(html: string, zone: string): string;
/** The tap's session document for `zone`, given the tab's current one. */
export declare function tapDocument(tap: { zone: string; mode?: string; name?: string; at?: number; held?: string | null }): string;
/** `/` with only the run's flags, never a zone. */
export declare function zoneHome(origin: string, flags?: string | Record<string, string>): string;
