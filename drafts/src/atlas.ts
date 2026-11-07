// The drafts site's data contract (WORLDCLAW-TOOLS W1). `drafts/tools/atlas.ts` writes it, the site and the artifact page
// read it. Pure types and helpers: no DOM, no node, so the generator, the page and the tests share one copy.

/** The WorldClaw run's stages (WORLDCLAW-SHARD §2). P1 → P17 are the 17 ticks of a draft's stage bar (J39). */
export const STAGES = [
  { id: 'P0', name: 'Start', tick: false },
  { id: 'P1', name: 'Vision', tick: true },
  { id: 'P2', name: 'Pitches', tick: true },
  { id: 'P3', name: 'Art direction', tick: true },
  { id: 'P4', name: 'Concepts', tick: true },
  { id: 'P5', name: 'The map', tick: true },
  { id: 'P5b', name: 'Content', tick: false },
  { id: 'P6', name: 'First-person views', tick: true },
  { id: 'P7', name: 'Verb gate', tick: true },
  { id: 'P8', name: 'Grey world', tick: true },
  { id: 'P9', name: 'Session slice', tick: true },
  { id: 'P9b', name: 'Re-target', tick: false },
  { id: 'P10', name: 'Look', tick: true },
  { id: 'P11', name: 'Catalog', tick: true },
  { id: 'P12', name: 'Places', tick: true },
  { id: 'P13', name: 'Content + audio', tick: true },
  { id: 'P14', name: 'Budgets', tick: true },
  { id: 'P15', name: 'Final judges', tick: true },
  { id: 'P16', name: 'Final board', tick: true },
  { id: 'P17', name: 'First walk', tick: true },
] as const;

export type StageId = (typeof STAGES)[number]['id'];
export const STAGE_IDS: readonly StageId[] = STAGES.map((s) => s.id);
export const TICKS: readonly StageId[] = STAGES.filter((s) => s.tick).map((s) => s.id);

export function isStageId(v: string): v is StageId {
  return (STAGE_IDS as readonly string[]).includes(v);
}

export function stageName(id: StageId): string {
  return STAGES.find((s) => s.id === id)?.name ?? id;
}

/** Order of a stage in the run; P5b sorts between P5 and P6. */
export function stageOrder(id: StageId): number {
  return STAGE_IDS.indexOf(id);
}

/** How many of the 17 ticks are done when the run is at `current` (the current stage itself is not done). */
export function ticksDone(current: StageId): number {
  const at = stageOrder(current);
  return TICKS.filter((t) => stageOrder(t) < at).length;
}

export type ItemKind =
  | 'reference' // an input: a live capture, a style anchor
  | 'pitch' // P2 key art per pitch
  | 'look' // P3 art-direction frames
  | 'keyart'
  | 'concept' // P4: a place, a character, a creature, gear
  | 'map' // a painted map
  | 'world' // a World Explorer view of the map (8 angles, 3-in-1)
  | 'blockout' // a render of the 3D blockout
  | 'fp' // a first-person view
  | 'journey' // the content boards: the journey, quests, side content, the slice
  | 'step' // a quest step's wildcard image
  | 'board' // a decision board
  | 'proto'; // a prototype's evidence

export type ItemStatus = 'picked' | 'current' | 'rejected' | 'superseded' | 'input';

export type ConceptSub = 'place' | 'character' | 'creature' | 'boss' | 'gear';

/** One picture on Blob (J28): `<blob>/draft/<slug>/<hash>-full.webp` (the original's pixels as WebP) and `…-thumb.webp`
 * (a grid tile's size). `w` / `h` are the original's, for the aspect. */
export interface Img {
  hash: string;
  w: number;
  h: number;
}

export function imgUrl(blob: string, slug: string, img: Img, size: 'full' | 'thumb'): string {
  return `${blob}/draft/${slug}/${img.hash}-${size}.webp`;
}

export interface Item {
  id: string;
  round: string;
  stage: StageId;
  kind: ItemKind;
  title: string;
  status: ItemStatus;
  images: Img | null;
  place?: string;
  step?: number;
  sub?: ConceptSub;
  /** A view id shared by every picture of one view across rounds (concept → try 1 → blockout → wave 2). */
  view?: string;
  /** A map / world-view angle (n, ne, …, top) or a variant letter. */
  angle?: string;
  spoiler: boolean;
  /** the game build a mockup was edited from (provenance; required in rounds marked `requireRef`) */
  ref?: string;
}

export interface Round {
  id: string;
  stage: StageId;
  title: string;
  note: string;
  made: string;
  verdict: string;
}

export interface StageEntry {
  id: StageId;
  name: string;
  state: 'done' | 'current' | 'todo';
  /** Jake's answers, verbatim, from the verdict log (read-only: J17). */
  answers: string[];
  /** Jake's notes on the stage, verbatim where quoted. */
  notes: string[];
  /** The decision's picked item, shown large on the stage page (J40). */
  pick?: string;
  rounds: string[];
}

export interface Place {
  id: string;
  num: number;
  name: string;
  role: string;
  x: number;
  z: number;
  beat: string;
}

export interface Cam {
  id: string;
  place: string;
  eye: [number, number, number];
  look: [number, number, number];
  /** The camera check (J46): does the view agree with the map and the blockout? */
  ok: boolean | null;
  note: string;
}

export interface Step {
  n: number;
  title: string;
  place: string;
  x: number;
  z: number;
  why: string;
  gets: string;
  lane: number;
  mechanics: string[];
  items: string[];
}

export interface Mechanic {
  id: string;
  name: string;
  where: string;
  engine: string;
  isNew: boolean;
  row: string;
  state: string;
}

export interface Model {
  id: string;
  name: string;
  sub: ConceptSub;
  concept: string;
  model: string | null;
  inGame: string | null;
  spoiler: boolean;
}

/** A planned set (J46, J49): the models placed in one spot, as the game's Set Explorer shows a built one. Planned numbers
 * come from the catalog (P11); `bounds` is the spot on the map in metres (x east, z south, centred). */
export interface SetPlan {
  id: string;
  name: string;
  region: string;
  members: { model: string; copies: number; tris: number; draws: number }[];
  aerial: string | null;
  bounds: { x: number; z: number; w: number; d: number } | null;
}

/** One decision as Jake saw it (W5, J68): the question, the options side by side, the recommendation and his answer. */
export interface Board {
  id: string;
  stage: StageId;
  question: string;
  options: { label: string; item: string | null; note: string }[];
  /** the option label the run recommended; null when none was recorded */
  recommended: string | null;
  /** the option label Jake picked; null for an approval or a review with no single pick */
  picked: string | null;
  answer: string[];
}

/** A design document of the draft (design.md, the style bible, the pitches), as text. */
export interface DesignDoc {
  name: string;
  text: string;
}

export interface Proto {
  id: string;
  question: string;
  result: string;
  changed: string;
  items: string[];
  play: string | null;
  peakMB: number | null;
}

export interface Side {
  id: string;
  title: string;
  text: string;
  x: number;
  z: number;
}

/** The measured checks of one map variant (the dry run's prototype PA / PB1 stats). */
export interface VariantStats {
  places_in_region: number;
  places_total: number;
  land_pct: number;
  walkable_pct_of_land: number;
  gentle_lt30_pct_of_land: number;
  place_pct_under_30deg: Record<string, number>;
  bands_pct: { close_le30m: number; mid_30_80m: number; far_gt80m: number; unseen: number };
}

/** Map Lab's data (W6): a height field and region labels over the map, the roads and the places' radii. */
export interface Terrain {
  /** Paths under /data/<slug>/: Float32 heights (m) and Uint8 region indices, `res`² cells, row 0 = north (z = −size/2). */
  heights: string;
  labels: string;
  res: number;
  size: number;
  cats: { id: string; color: string; walkable: boolean }[];
  roads: { name: string; w: number; pts: [number, number][] }[];
  places: { id: string; x: number; z: number; r: number }[];
  variants: { id: string; title: string; stats: VariantStats }[];
}

export interface RunHeader {
  stage: StageId;
  waiting: string;
  next: string;
}

export interface Atlas {
  version: 1;
  /** The public Blob store's origin (J28). */
  blob: string;
  /** The originals' folder in git (J30): an item's original is `<art>/<item id>`; how it was made is its round's `made`. */
  art: string;
  slug: string;
  name: string;
  line: string;
  generated: string;
  run: RunHeader;
  keyArt: Img | null;
  /** The approved painted map (an item id) and the world size in metres; x east, z south, centred. */
  map: { item: string; size: number } | null;
  stages: StageEntry[];
  rounds: Round[];
  items: Item[];
  places: Place[];
  cams: Cam[];
  steps: Step[];
  side: Side[];
  lanes: { stage: number; pts: [number, number][] }[];
  mechanics: Mechanic[];
  models: Model[];
  sets: SetPlan[];
  protos: Proto[];
  /** view id → item ids, oldest first. */
  lineages: Record<string, string[]>;
  terrain: Terrain | null;
  /** a camera-check note that holds for every first-person view (Jake's review of the set) */
  camNoteAll: string;
  boards: Board[];
  design: DesignDoc[];
}

/** One draft on the drafts site's title (`/data/index.json`): public-safe, no spoilers (J2, J13). */
export interface DraftCard {
  slug: string;
  name: string;
  line: string;
  keyArt: Img | null;
  stage: StageId;
  stageName: string;
  waiting: string;
  ticks: number;
}

export interface DraftIndex {
  version: 1;
  blob: string;
  generated: string;
  drafts: DraftCard[];
}

/** Spoilers by kind (WORLDCLAW-TOOLS §2.6): maps, the boss, secrets, the critical path. The key art is the exception (J38). */
export function spoilerByKind(kind: ItemKind, sub: ConceptSub | undefined, placeRole: string | undefined): boolean {
  if (kind === 'keyart') return false;
  if (kind === 'map' || kind === 'journey' || kind === 'step') return true;
  if (sub === 'boss') return true;
  return placeRole === 'secret' || placeRole === 'boss';
}

export function itemById(atlas: Atlas, id: string): Item | undefined {
  return atlas.items.find((i) => i.id === id);
}
