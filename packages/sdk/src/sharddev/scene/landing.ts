// Meta MOSSGATE-ZONE MZ31 (QA 11-19 row 35, Jake in Glowfen: "I'm setting these lanterns and nothing happens. It's just so
// anticlimactic."): a quest beat lands where it happened. `world.questStep` places a step's landing at a scene node (format
// 0.56 `quests[].steps[].feedback`): the engine flares the spot, spreads its light over the ground, pops a reward and sounds
// one of its own synth voices. `world.questPayoff` places a quest's (`onComplete.payoff`): a bigger landing, the score's
// reward take and the next goal, and with `reveal` the world change: the sdk writes a shared flag the quest's completion
// raises through its declared scene hook (`onComplete.scene`, the same hook a dialogue choice runs), so a panel part's
// `shownWhen` on it appears the moment the quest is done. The quests themselves stay what `extend` wrote; the scene only
// adds where their beats land.
import { SceneRefusalError } from './refusal';

/** The engine's synth interaction voices a beat may sound (engine `InteractSfx`; no recording ships). */
export const LANDING_SOUNDS = ['chime', 'glyph', 'ignite', 'chest', 'lever', 'plate', 'door', 'grate'] as const;
export type LandingSound = (typeof LANDING_SOUNDS)[number];

/** How a step's beat lands: its colour (#rrggbb), how far its light spreads (1 to 40 m) and its voice. */
export interface LandingOptions {
  readonly colour?: string;
  readonly radius?: number;
  readonly sound?: LandingSound;
}
/** How a quest's payoff lands: a landing, its music (`dawn`, the default, or `none`), the next goal's text and the shared
 *  flag it reveals (a panel part's `shownWhen: { field, equals: true }` shows the world change). */
export interface PayoffOptions extends LandingOptions {
  readonly music?: 'dawn' | 'none';
  readonly next?: string;
  readonly reveal?: string;
}

/** One placed beat: a step's (`step` set) or a quest's payoff, at a node's world position. */
export interface SceneLanding {
  readonly quest: string;
  readonly step: string | null;
  readonly at: { readonly x: number; readonly y: number; readonly z: number };
  readonly options: PayoffOptions;
  /** a payoff with `reveal`: the scene hook its completion runs */
  readonly scene?: string;
}

const ID = /^[a-z][a-zA-Z0-9.-]{0,127}$/u;
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** A beat's options, refused where the format would refuse them. */
function checked(id: string, options: PayoffOptions, payoff: boolean): PayoffOptions {
  const { colour, radius, sound, music, next, reveal } = options;
  if (colour !== undefined && !/^#[0-9a-fA-F]{6}$/u.test(colour)) throw new SceneRefusalError(id, `a landing's colour ${colour} is not #rrggbb`, 'Give the colour as #rrggbb');
  if (radius !== undefined && !(radius >= 1 && radius <= 40)) throw new SceneRefusalError(id, `a landing's light spreads ${String(radius)} m, outside 1 to 40`, 'Give radius in metres from 1 to 40');
  if (sound !== undefined && !(LANDING_SOUNDS as readonly string[]).includes(sound)) throw new SceneRefusalError(id, `${String(sound)} is not one of the engine's voices`, `Pick one of ${LANDING_SOUNDS.join(', ')}: no recordings ship`);
  if (!payoff && (music !== undefined || next !== undefined || reveal !== undefined)) throw new SceneRefusalError(id, 'a step lands; only a quest\'s payoff has music, a next goal or a reveal', 'Move them to world.questPayoff');
  if (music !== undefined && music !== 'dawn' && music !== 'none') throw new SceneRefusalError(id, `a payoff's music ${String(music)} is not dawn or none`, 'Use dawn (the score\'s reward take) or none');
  if (next !== undefined && (next.length === 0 || next.length > 512)) throw new SceneRefusalError(id, 'a next goal is 1 to 512 characters', 'Shorten it');
  if (reveal !== undefined && !/^[a-z][a-z0-9.-]{0,127}$/u.test(reveal)) throw new SceneRefusalError(id, `${reveal} is not a state field name`, 'Name it like `mossgate.hollow.lit`');
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as PayoffOptions;
}

/** A step's or a payoff's beat at `at` (a payoff with `reveal` runs scene `<quest>.payoff`, whose write the caller makes). */
export function sceneLanding(quest: string, step: string | null, at: { x: number; y: number; z: number }, options: PayoffOptions, before: readonly SceneLanding[]): SceneLanding {
  const id = step === null ? `${quest} payoff` : `${quest}/${step}`;
  if (!ID.test(quest) || (step !== null && !ID.test(step))) throw new SceneRefusalError(id, 'a quest or step id is not a shardfile id', 'Name them as extend\'s quests do');
  if (before.some((l) => l.quest === quest && l.step === step)) throw new SceneRefusalError(id, step === null ? 'this quest pays off twice' : 'this step lands twice', 'Place each beat once');
  const kept = checked(id, options, step === null), scene = kept.reveal === undefined ? undefined : `${quest}.payoff`;
  return { quest, step, at: { x: r3(at.x), y: r3(at.y), z: r3(at.z) }, options: kept, ...(scene === undefined ? {} : { scene }) };
}

interface QuestRow { readonly id: string; readonly steps: readonly { readonly id: string; readonly feedback?: unknown }[]; readonly onComplete?: { readonly scene?: string; readonly payoff?: unknown } }
/** The format row a beat lowers to. */
function row(landing: SceneLanding, payoff: boolean): Record<string, unknown> {
  const { colour, radius, sound, music, next } = landing.options;
  return { at: landing.at, ...(colour === undefined ? {} : { colour }), ...(radius === undefined ? {} : { radius }), ...(sound === undefined ? {} : { sound }),
    ...(payoff && music !== undefined ? { music } : {}), ...(payoff && next !== undefined ? { next } : {}) };
}

/** The beats merged into the quests `extend` wrote: a step's `feedback`, a quest's `onComplete.payoff` (and its scene). */
export function withLandings<Q extends QuestRow>(quests: readonly Q[], landings: readonly SceneLanding[]): Q[] {
  if (landings.length === 0) return [...quests];
  for (const l of landings) if (!quests.some((q) => q.id === l.quest)) throw new SceneRefusalError(l.quest, `no quest ${l.quest} in extend`, 'Land a beat on a quest extend declares');
  return quests.map((quest) => {
    const mine = landings.filter((l) => l.quest === quest.id);
    if (mine.length === 0) return quest;
    const steps = quest.steps.map((step) => {
      const landing = mine.find((l) => l.step === step.id);
      if (landing === undefined) return step;
      if (step.feedback !== undefined) throw new SceneRefusalError(`${quest.id}/${step.id}`, 'extend gives this step a feedback too', 'Declare it once');
      return { ...step, feedback: row(landing, false) };
    });
    for (const l of mine) if (l.step !== null && !quest.steps.some((s) => s.id === l.step)) throw new SceneRefusalError(`${quest.id}/${l.step}`, `quest ${quest.id} has no step ${l.step}`, 'Name a step the quest declares');
    const payoff = mine.find((l) => l.step === null);
    if (payoff === undefined) return { ...quest, steps };
    if (quest.onComplete?.payoff !== undefined) throw new SceneRefusalError(quest.id, 'extend gives this quest a payoff too', 'Declare it once');
    if (payoff.scene !== undefined && quest.onComplete?.scene !== undefined) throw new SceneRefusalError(quest.id, `quest ${quest.id} already runs scene ${quest.onComplete.scene} on completion`, 'Reveal through that scene, or drop reveal');
    return { ...quest, steps, onComplete: { ...quest.onComplete, ...(payoff.scene === undefined ? {} : { scene: payoff.scene }), payoff: row(payoff, true) } };
  });
}
