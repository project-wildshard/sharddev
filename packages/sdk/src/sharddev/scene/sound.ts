/**
 * Meta MOSSGATE-ZONE MZ23: a scene shard's sound, written as the format `audio` rows the engine already reads, with no
 * recordings of the shard's own (J304: one music style, the engine's piano, so the audio budget holds no shard bytes).
 *
 * - `world.music`: a score of the engine's piano slots, its scene `day` while it is light, `night` once it is dark and
 *   `boss` while one of the shard's bosses fights. Needs an engine whose grid cells play a score (engine `30c22f00`).
 * - `world.ambience`: the cell's synth wind bed, a few band-passed noise winds, played while a player stands in the cell.
 *
 * Declaring either one also stops the scene shard's default silent score (format `score: 'silent'`, which holds the music
 * bus at 0 while a player stands in the cell, the quest-step stings with it), so a quest step is heard.
 */
import type { Shardfile } from '@wildshard/format/shardSchema';
import { SceneRefusalError } from './refusal';

/** A slot of the engine's piano style (format `engine-music.ts`): the title theme, the island theme or the pine theme. */
export type EngineSlot = 'title' | 'island' | 'pine';
const SLOTS: readonly EngineSlot[] = ['title', 'island', 'pine'];

/** What `world.music` plays: an engine slot by day, and optionally another by night and while a boss fights. */
export interface MusicOptions { readonly day: EngineSlot; readonly night?: EngineSlot; readonly boss?: EngineSlot }

/** One wind of the bed (format `audio.ambience.winds`): band-passed noise at `frequency` Hz (20 to 20,000) with
 *  resonance `q` (0.01 to 20), panned -1 to 1, its gain (at most 0.2) swelling at `rate` cycles a second (0.01 to 10). */
export interface Wind { readonly frequency: number; readonly q: number; readonly pan: number; readonly rate: number; readonly gain: number }
/** What `world.ambience` plays: one to eight winds. */
export interface AmbienceOptions { readonly winds: readonly Wind[] }

type AudioRows = Shardfile['audio'];
type MusicRows = NonNullable<AudioRows['music']>;

/** The score `world.music` declares: the day slot its base; the boss scene first, then night, then day. */
export function musicRows(slug: string, options: MusicOptions): MusicRows {
  const { day, night, boss } = options;
  for (const slot of [day, night, boss]) if (slot !== undefined && !SLOTS.includes(slot)) throw new SceneRefusalError('music', `music slot ${String(slot)} is not one of the engine's piano slots`, `Name one of ${SLOTS.join(', ')} (J304: the engine plays one style)`);
  const when = (scene: string): MusicRows['selection'][number]['when'] => [{ field: 'scene', op: 'equals', value: scene }];
  const selection: MusicRows['selection'] = [
    ...(boss === undefined ? [] : [{ slots: [boss], when: when('boss') }]),
    ...(night === undefined ? [] : [{ slots: [night], when: when('night') }]),
    { slots: [day], when: when('day') },
  ];
  return {
    id: `score.${slug}`, base: day, slots: [...new Set([day, night ?? day, boss ?? day])], bootSlots: [day], synthLead: 'pluck', minFade: 0, source: null,
    sets: {}, selection, selectMode: 'first', catalogue: { mode: 'slots', extraStings: [], stingSets: {} },
    lifecycle: { persistent: false, dispose: true, logChanges: false, ...(boss === undefined ? {} : { bossScene: 'boss' }) },
  } as MusicRows;
}

/** The bed `world.ambience` declares, named for the shard. */
export function ambienceRows(slug: string, options: AmbienceOptions): NonNullable<AudioRows['ambience']> {
  const { winds } = options;
  if (winds.length === 0 || winds.length > 8) throw new SceneRefusalError('ambience', `the ambience has ${String(winds.length)} winds, not 1 to 8`, 'Give it one to eight winds');
  const within = (value: number, low: number, high: number): boolean => Number.isFinite(value) && value >= low && value <= high;
  winds.forEach((w, i) => {
    if (!within(w.frequency, 20, 20000) || !within(w.q, 0.01, 20) || !within(w.pan, -1, 1) || !within(w.rate, 0.01, 10) || !within(w.gain, 0, 0.2)) {
      throw new SceneRefusalError('ambience', `wind ${String(i)} is outside its ranges`, 'frequency 20 to 20000 Hz, q 0.01 to 20, pan -1 to 1, rate 0.01 to 10, gain 0 to 0.2');
    }
  });
  return { bed: `${slug}.bed`, winds: winds.map(({ frequency, q, pan, rate, gain }) => ({ frequency, q, pan, rate, gain })) };
}

/** The shard's `audio` once the scene declared music or an ambience: the format's own rows otherwise kept (`base`). */
export function sceneAudioRows(base: AudioRows, music: MusicRows | null, ambience: AudioRows['ambience']): AudioRows {
  return { ...base, score: 'default', ...(music === null ? {} : { music }), ...(ambience === null ? {} : { ambience }) };
}
