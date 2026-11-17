// meta NEW-SHARD-E2E F27: a walk proof plays a shard on a served page the way a player does (walk, E to talk, a digit to
// answer, a click to swing) and asserts what the server then says (flags, quest steps). `wildshard prove <source> <walk.mjs>
// --base <dev url>` runs one in headless Chromium (scripts/prove-walk.mjs); this module is the part that knows the shard's
// rows and the page's reads, behind a small page port, so tests drive it without a browser.
import type { Shardfile } from '@wildshard/format/shardSchema';

/** The few page calls a walk proof makes: Playwright's `Page` satisfies it. */
export interface WalkPage {
  evaluate: <R, A>(read: (arg: A) => R | Promise<R>, arg: A) => Promise<R>;
  keyboard: { press: (key: string) => Promise<void>; down: (key: string) => Promise<void>; up: (key: string) => Promise<void> };
  mouse: { move: (x: number, y: number) => Promise<void>; down: () => Promise<void>; up: () => Promise<void> };
  waitForTimeout: (ms: number) => Promise<void>;
}
/** The rows a walk proof reads: the page's own copy of the shard (`__wildshard.shard.shardfile.source`). */
export type WalkRows = Pick<Shardfile, 'targets' | 'quests' | 'creatures'> & { readonly rows: Pick<Shardfile['rows'], 'species'> };
/** What the server says of this player now. A quest's step is `unstarted`, a step id, or null once complete. */
export interface WalkState { readonly x: number; readonly z: number; readonly hp: number; readonly kills: number; readonly flags: readonly string[]; readonly quests: Readonly<Record<string, string | null>> }
/** The dialogue box on screen: its name, its text and the answers it offers, in order. */
export interface WalkBox { readonly open: boolean; readonly name: string; readonly text: string; readonly choices: readonly string[]; readonly choosing: boolean }
/** An open talk: the node the server put this player at and the answers it offers, by id and label. */
export interface OpenTalk { readonly talk: string; readonly node: string | null; readonly name: string; readonly text: string; readonly choices: readonly { readonly id: string; readonly label: string }[] }
/** One proof step's record, printed in the report. */
export interface WalkStep { readonly step: string; readonly ms: number; readonly [detail: string]: unknown }
/** Where a walk can go: a talk, an interaction or a creature spawn by id, or a point. */
export type WalkTarget = string | { readonly x: number; readonly z: number };

/** A refusal a walk proof prints as its one line. */
export class WalkProofError extends Error { override readonly name = 'WalkProofError'; }

interface Point { readonly x: number; readonly z: number }
type Talk = NonNullable<Shardfile['targets']['talks']>[number];
type Tree = Shardfile['quests']['dialogue'][number];

// The page reads, run inside the page. Each is self-contained: Playwright sends its source text, not its closure.
/* oxlint-disable typescript/no-unsafe-type-assertion -- these run in the page and read its debug globals, typed here by hand */
const readState = (): WalkState | null => {
  const report = (window as unknown as { __workerClient?: () => WalkState }).__workerClient?.();
  if (report === undefined) return null;
  return { x: report.x, z: report.z, hp: report.hp, kills: report.kills, flags: [...report.flags], quests: { ...report.quests } };
};
const readRows = (): WalkRows | null => {
  const probe = (window as unknown as { __wildshard?: { shard?: { shardfile?: { source?: WalkRows } } } }).__wildshard;
  const source = probe?.shard?.shardfile?.source;
  return source === undefined ? null : { targets: source.targets, quests: source.quests, creatures: source.creatures, rows: { species: source.rows.species } };
};
const readNodes = (): Record<string, string | null> => {
  const probe = (window as unknown as { __wildshard?: { shard?: { shardfileTalks?: { talks: () => { id: string; node: string | null }[] } } } }).__wildshard;
  return Object.fromEntries((probe?.shard?.shardfileTalks?.talks() ?? []).map(row => [row.id, row.node]));
};
const readBox = (): WalkBox => {
  const root = [...document.querySelectorAll('.ws-quest-talk.show')].find(box => box.getBoundingClientRect().height > 4);
  if (root === undefined) return { open: false, name: '', text: '', choices: [], choosing: false };
  const words = (selector: string): string => root.querySelector(selector)?.textContent?.trim() ?? '';
  return { open: true, name: words('.ws-quest-talk-name'), text: words('.ws-quest-talk-text'), choosing: root.classList.contains('choosing'),
    choices: [...root.querySelectorAll('.ws-quest-talk-choice')].map(choice => choice.textContent?.trim() ?? '') };
};
const aim = (at: { x: number; z: number; y: number; from: { x: number; z: number } }): void => {
  const player = (window as unknown as { __wildshard: { world: { player: { yaw: number; pitch: number; position?: { y: number } } } } }).__wildshard.world.player;
  const dx = at.x - at.from.x, dz = at.z - at.from.z;
  player.yaw = Math.atan2(-dx, -dz);
  // level for a walk (y NaN); toward the body for a swing
  player.pitch = Number.isNaN(at.y) ? 0 : -Math.atan2(Math.max(0.3, (player.position?.y ?? at.y + 1.6) - at.y - 0.6), Math.max(0.8, Math.hypot(dx, dz)));
};
const readCreatures = (kind: string): { x: number; y: number; z: number }[] =>
  [...((window as unknown as { __workerClientRows?: (kind: string) => readonly { x: number; y: number; z: number }[] }).__workerClientRows?.(kind) ?? [])];
/* oxlint-enable typescript/no-unsafe-type-assertion */

/** The talk row an id names, or a refusal listing the shard's talks. */
export function talkRow(rows: WalkRows, id: string): Talk {
  const talks = rows.targets.talks ?? [], talk = talks.find(row => row.id === id);
  if (talk === undefined) throw new WalkProofError(`no talk ${id}; this shard's talks: ${talks.map(row => row.id).join(', ') || 'none'}`);
  return talk;
}
/** The dialogue tree a talk opens. */
export function talkTree(rows: WalkRows, talk: Talk): Tree {
  const tree = rows.quests.dialogue.find(row => row.id === talk.dialogue);
  if (tree === undefined) throw new WalkProofError(`talk ${talk.id} names dialogue ${talk.dialogue}, which the shard does not declare`);
  return tree;
}
/** Where an id stands: a talk, an interaction or a creature spawn; a point is itself. */
export function targetPoint(rows: WalkRows, target: WalkTarget): Point {
  if (typeof target !== 'string') return target;
  const at = rows.targets.talks?.find(row => row.id === target)?.at ?? rows.targets.interactions.find(row => row.id === target)?.at
    ?? rows.creatures.spawns.find(row => row.id === target)?.at;
  if (at === undefined) {
    const known = [...(rows.targets.talks ?? []), ...rows.targets.interactions, ...rows.creatures.spawns].map(row => row.id);
    throw new WalkProofError(`no talk, interaction or spawn ${target}; this shard has: ${known.join(', ') || 'none'}`);
  }
  return { x: at[0], z: at[2] };
}
/** The offered answers of a node, by id and label, in the order the box shows them. The page offers the choices whose
 *  condition the player's flags meet (engine `world/interact/flags` `test`), so two answers with one label part by that. */
export function offeredChoices(tree: Tree, node: string | null, labels: readonly string[], flags: readonly string[]): { id: string; label: string }[] {
  const has = (flag: string): boolean => flags.includes(flag);
  const holds = (when: Tree['nodes'][number]['choices'][number]['when']): boolean => when === undefined
    || ((when.all ?? []).every(has) && ((when.any ?? []).length === 0 || (when.any ?? []).some(has)) && !(when.none ?? []).some(has));
  const row = tree.nodes.find(candidate => candidate.id === node), left = (row?.choices ?? []).filter(choice => holds(choice.when));
  return labels.map(label => {
    const at = left.findIndex(choice => choice.label === label), choice = at === -1 ? undefined : left.splice(at, 1)[0];
    return { id: choice?.id ?? '', label };
  });
}
/** The offered answer `wanted` names: its id, its exact label, or one label it is part of (any case). */
export function pickChoice(open: OpenTalk, wanted: string): number {
  const list = (): string => open.choices.map(choice => `${choice.id} ("${choice.label}")`).join(', ') || 'none';
  const exact = open.choices.findIndex(choice => choice.id === wanted || choice.label === wanted);
  if (exact !== -1) return exact;
  const lower = wanted.toLowerCase(), partial = open.choices.flatMap((choice, at) => choice.label.toLowerCase().includes(lower) ? [at] : []);
  if (partial.length === 1) return partial[0] ?? -1;
  if (partial.length > 1) throw new WalkProofError(`talk ${open.talk} at node ${open.node ?? 'closed'}: "${wanted}" matches ${partial.length} answers; name one by id: ${list()}`);
  throw new WalkProofError(`talk ${open.talk} at node ${open.node ?? 'closed'} has no answer "${wanted}" now; it offers: ${list()}`);
}

/** How long a step waits for the server before it refuses. */
export interface WalkTimes { readonly settle: number; readonly poll: number; readonly walkSteps: number; readonly fightMs: number }
const TIMES: WalkTimes = { settle: 8000, poll: 250, walkSteps: 160, fightMs: 60000 };

/** The walk helpers on `page`; each records a step, and each refusal says what the page showed instead. */
/** The helpers a walk script's default export receives (with `page`, the Playwright page, for anything else). */
export interface WalkProof {
  /** Every step so far, with its time and what it saw. */
  readonly steps: readonly WalkStep[];
  /** The shard's rows as the page holds them. */
  rows: () => Promise<WalkRows>;
  /** What the server says of this player now. */
  state: () => Promise<WalkState>;
  /** Walk to a talk, an interaction, a spawn or a point, to within `reach` metres (default 1.5). */
  walkTo: (target: WalkTarget, reach?: number) => Promise<WalkState>;
  /** Walk to a talk, press E and wait for its box: the server's node and the answers it offers now. */
  talk: (id: string) => Promise<OpenTalk>;
  /** Answer the open talk by choice id or label (or a unique part of one, any case); waits for the server's next node. */
  choose: (wanted: string) => Promise<{ talk: string; choice: string; from: string | null; to: string | null }>;
  /** Fight a spawn's species (or a species kind) until the server shows none of it alive. */
  fight: (target: string) => Promise<{ kind: string; swings: number }>;
  /** Wait until the server says this player has every `all` flag and none of the `none` flags. */
  expectFlags: (all: readonly string[], none?: readonly string[]) => Promise<readonly string[]>;
  /** Wait until a quest is at `step`: a step id, `unstarted`, or `complete`. */
  expectQuest: (id: string, step: string) => Promise<string | null>;
}
export function walkProof(page: WalkPage, times: Partial<WalkTimes> = {}): WalkProof {
  const wait = { ...TIMES, ...times }, steps: WalkStep[] = [];
  let rowsHeld: WalkRows | null = null, open: OpenTalk | null = null;
  const record = <T extends object>(step: string, started: number, detail: T): T => { steps.push({ step, ms: Date.now() - started, ...detail }); return detail; };
  const rows = async (): Promise<WalkRows> => {
    rowsHeld ??= await page.evaluate(readRows, undefined);
    if (rowsHeld === null) throw new WalkProofError('the page has no shard rows (`__wildshard.shard.shardfile`): enter the shard on a `wildshard dev` page first');
    return rowsHeld;
  };
  const state = async (): Promise<WalkState> => {
    const now = await page.evaluate(readState, undefined);
    if (now === null) throw new WalkProofError('the page has no server client (`__workerClient`): enter the shard on a `wildshard dev` page first');
    return now;
  };
  /** Poll until `done` holds or the settle time passes; the last read either way. */
  const until = async <T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<{ value: T; held: boolean }> => {
    const end = Date.now() + wait.settle;
    for (;;) {
      const value = await read();
      if (done(value)) return { value, held: true };
      if (Date.now() >= end) return { value, held: false };
      await page.waitForTimeout(wait.poll);
    }
  };
  const box = async (): Promise<WalkBox> => await page.evaluate(readBox, undefined);
  /** Close a box left open: E closes one with no answers; Escape (the modal's back) one with answers, as E would take the first. */
  const closeBox = async (): Promise<void> => {
    for (let tries = 0; tries < 4 && (await box()).open; tries += 1) {
      await page.keyboard.press((await box()).choices.length > 0 ? 'Escape' : 'e'); await page.waitForTimeout(400);
    }
    open = null;
  };
  /** Face the point and hold W in short bursts until within `reach` metres; the server moves the body. */
  const walk = async (point: Point, reach: number): Promise<WalkState> => {
    let now = await state();
    for (let step = 0; step < wait.walkSteps; step += 1) {
      const distance = Math.hypot(point.x - now.x, point.z - now.z);
      if (distance <= reach) return now;
      await page.evaluate(aim, { x: point.x, z: point.z, y: Number.NaN, from: { x: now.x, z: now.z } });
      await page.keyboard.down('w'); await page.waitForTimeout(distance > 6 ? 400 : distance > 3 ? 200 : 100); await page.keyboard.up('w');
      now = await state();
    }
    throw new WalkProofError(`walk stopped ${Math.hypot(point.x - now.x, point.z - now.z).toFixed(1)} m from (${point.x.toFixed(1)}, ${point.z.toFixed(1)}) after ${wait.walkSteps} steps, at (${now.x.toFixed(1)}, ${now.z.toFixed(1)})`);
  };
  return {
    steps,
    rows,
    state,
    /** Walk to a talk, an interaction, a spawn or a point, to within `reach` metres (default 1.5). */
    async walkTo(target: WalkTarget, reach = 1.5): Promise<WalkState> {
      const started = Date.now(); await closeBox();
      const point = targetPoint(await rows(), target), end = await walk(point, reach);
      record('walkTo', started, { target: typeof target === 'string' ? target : `${point.x},${point.z}`, x: end.x, z: end.z });
      return end;
    },
    /** Walk to the talk, press E and wait for its box; the node is the server's, the answers are the ones it offers now. */
    async talk(id: string): Promise<OpenTalk> {
      const started = Date.now(), all = await rows(), talk = talkRow(all, id), tree = talkTree(all, talk);
      await closeBox();
      await walk({ x: talk.at[0], z: talk.at[2] }, Math.max(0.8, talk.radius * 0.6));
      await page.keyboard.press('e');
      // the box types its lines; it is ready once it shows its answers, or its whole text when it has none
      const shown = await until(box, seen => seen.open && seen.name === tree.name && (seen.choosing || (seen.choices.length === 0 && seen.text.length > 0)));
      if (!shown.held) throw new WalkProofError(`E at talk ${id} opened ${shown.value.open ? `"${shown.value.name}", not "${tree.name}"` : 'no dialogue box'}; is another prompt nearer?`);
      const node = (await page.evaluate(readNodes, undefined))[id] ?? null, { flags } = await state();
      open = { talk: id, node, name: shown.value.name, text: shown.value.text, choices: offeredChoices(tree, node, shown.value.choices, flags) };
      return record('talk', started, open);
    },
    /** Answer the open talk by choice id or label (or a unique part of one, any case), then wait for the server's next node. */
    async choose(wanted: string): Promise<{ talk: string; choice: string; from: string | null; to: string | null }> {
      const started = Date.now();
      if (open === null) throw new WalkProofError(`choose "${wanted}": no talk is open; call talk(<id>) first`);
      const at = pickChoice(open, wanted), choice = open.choices[at], from = open.node, talk = open.talk;
      await page.keyboard.press(String(at + 1));
      open = null;
      const moved = await until(async () => (await page.evaluate(readNodes, undefined))[talk] ?? null, node => node !== from);
      if (!moved.held) throw new WalkProofError(`talk ${talk}: the server kept node ${from ?? 'closed'} after answer ${choice?.id ?? wanted}; read state() for the flags its condition wants`);
      await closeBox();
      return record('choose', started, { talk, choice: choice?.id ?? wanted, from, to: moved.value });
    },
    /** Fight the nearest live creature of a spawn's species (or a species kind) until the server says none is left. */
    async fight(target: string): Promise<{ kind: string; swings: number }> {
      const started = Date.now(), all = await rows(), spawn = all.creatures.spawns.find(row => row.id === target);
      const kind = spawn === undefined ? all.rows.species.find(row => row.kind === target)?.kind : (all.rows.species.find(row => row.id === spawn.species)?.kind ?? spawn.species);
      if (kind === undefined) throw new WalkProofError(`fight ${target}: no spawn or species kind ${target}; this shard's spawns: ${all.creatures.spawns.map(row => row.id).join(', ') || 'none'}`);
      await closeBox();
      let swings = 0;
      while (Date.now() - started < wait.fightMs) {
        const alive = await page.evaluate(readCreatures, kind);
        if (alive.length === 0) return record('fight', started, { kind, swings });
        const me = await state(), near = alive.reduce((a, b) => (Math.hypot(a.x - me.x, a.z - me.z) <= Math.hypot(b.x - me.x, b.z - me.z) ? a : b));
        if (Math.hypot(near.x - me.x, near.z - me.z) > 2.2) { await walk(near, 1.8).catch(() => undefined); continue; }
        await page.evaluate(aim, { x: near.x, z: near.z, y: near.y, from: { x: me.x, z: me.z } });
        await page.mouse.move(200, 300); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); swings += 1;
        await page.waitForTimeout(240);
      }
      throw new WalkProofError(`fight ${target}: a ${kind} still stands after ${swings} swings in ${wait.fightMs / 1000} s`);
    },
    /** Wait until the server says this player has every `all` flag and none of the `none` flags. */
    async expectFlags(all: readonly string[], none: readonly string[] = []): Promise<readonly string[]> {
      const started = Date.now(), seen = await until(state, now => all.every(flag => now.flags.includes(flag)) && none.every(flag => !now.flags.includes(flag)));
      if (!seen.held) {
        const missing = all.filter(flag => !seen.value.flags.includes(flag)), extra = none.filter(flag => seen.value.flags.includes(flag));
        throw new WalkProofError(`flags: ${[missing.length > 0 ? `missing ${missing.join(', ')}` : '', extra.length > 0 ? `unwanted ${extra.join(', ')}` : ''].filter(Boolean).join('; ')}; the server says: ${seen.value.flags.join(', ') || 'none'}`);
      }
      return record('expectFlags', started, { flags: seen.value.flags }).flags;
    },
    /** Wait until a quest is at `step`: a step id, `unstarted`, or `complete`. */
    async expectQuest(id: string, step: string): Promise<string | null> {
      const started = Date.now(), wanted = step === 'complete' ? null : step;
      const seen = await until(state, now => Object.hasOwn(now.quests, id) && now.quests[id] === wanted);
      if (!Object.hasOwn(seen.value.quests, id)) throw new WalkProofError(`no quest ${id}; the server knows: ${Object.keys(seen.value.quests).join(', ') || 'none'}`);
      if (!seen.held) throw new WalkProofError(`quest ${id} is at ${seen.value.quests[id] ?? 'complete'}, not ${step}`);
      return record('expectQuest', started, { quest: id, at: step }).at;
    },
  };
}
