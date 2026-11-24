// FORMAT-PRUNE FP47b (coordinator 2026-11-24, J505): every product this SDK writes names the lowest engine release that
// draws it, `requires.engine` (format 0.1.0.6). The cook and a pin of an older engine refuse it, so a republish can't
// land on a grid that's too old. Raise ENGINE_FLOOR with the change that needs a newer engine.
import { engineFloorRefusal } from '@wildshard/format/engine-floor';
import { carriesEngineFloor } from '@wildshard/format/version';

/** Engine v0.1.84: the first release on format 0.77.0 (it admits 0.1.0.6 products), with 839c8ba08's grid shell that reads
 * the level's look from `look/look` (discovery no longer copies it). */
export const ENGINE_FLOOR = '0.1.84';

/** Stamp the SDK's floor into an admitted source (an author's own higher floor stays); below 0.1.0.6 there is no word. */
export function stampEngineFloor(source: { readonly version: string; requires: { engine?: string } }): void {
  if (!carriesEngineFloor(source.version)) return;
  const own = source.requires.engine;
  if (own === undefined || engineFloorRefusal(own, ENGINE_FLOOR) === undefined) source.requires.engine = ENGINE_FLOOR;
}
