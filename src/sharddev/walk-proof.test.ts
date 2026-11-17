// meta NEW-SHARD-E2E F27: a walk proof talks to an NPC, answers it by choice id or by its words, and asserts the flags and
// quest step the server then says. A fake page stands in for the browser: it holds Honeyknoll's Wren and a server that moves
// her node and sets the choice's flags, so every helper runs its real reads, presses and refusals.
// oxlint-disable-next-line import/no-nodejs-modules -- the CLI route is checked by running bin/wildshard.mjs.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- the walk script and source are temporary files.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- resolve the repo's bin.
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { pickChoice, walkProof, type WalkBox, type WalkPage, type WalkRows, type WalkState } from './walkProof';

/* oxlint-disable typescript/no-unsafe-type-assertion -- the fake page answers each page read by its function's name */
const ROWS = {
  targets: { panels: [], interactions: [], talks: [{ id: 'wren', at: [-12, 0, 0], radius: 3, label: 'Talk to Wren', dialogue: 'wren' }] },
  creatures: { spawns: [{ id: 'honey-bear', species: 'bear', at: [14, 0, 7.5] }] },
  rows: { species: [{ id: 'bear', kind: 'bear' }] },
  quests: { flags: [], quests: [], triggers: [], dialogue: [{ id: 'wren', name: 'Wren the beekeeper', start: 'hello', nodes: [
    { id: 'hello', lines: ['A bear has found my hives.'], choices: [
      { id: 'accept', label: 'I will help.', next: 'waiting', when: { none: ['honey.met'] }, sets: ['honey.met'] },
      { id: 'later', label: 'Not now.', next: null, when: {}, sets: [] }] },
    { id: 'waiting', lines: ['Drive off the bear.'], choices: [
      // one label, two answers (Honeyknoll's hives): the flags say which one the box shows
      { id: 'too-soon', label: 'Here are three honeycombs.', next: 'waiting', when: { none: ['honey.gather-3'] }, sets: [] },
      { id: 'turn-in', label: 'Here are three honeycombs.', next: null, when: { all: ['honey.gather-3'] }, sets: ['honey.returned'] }] }] }] },
} as unknown as WalkRows;

/** A page with Wren and a server: W walks toward the aim, E opens her box at the server's node, a digit answers. */
function fakePage(): WalkPage & { pressed: string[]; flags: Set<string> } {
  const me = { x: 0, z: 0, yaw: 0 }, flags = new Set<string>(), pressed: string[] = [];
  let node: string | null = 'hello', box: WalkBox = { open: false, name: '', text: '', choices: [], choosing: false }, walking = false;
  const tree = ROWS.quests.dialogue[0], talk = ROWS.targets.talks?.[0];
  if (tree === undefined || talk === undefined) throw new Error('fixture');
  const offered = (): { id: string; label: string; next: string | null; sets: readonly string[] }[] => (tree.nodes.find(row => row.id === node)?.choices ?? [])
    .filter(choice => (choice.when.all ?? []).every(flag => flags.has(flag)) && (choice.when.none ?? []).every(flag => !flags.has(flag)));
  const quests = (): Record<string, string | null> => ({ 'honey-thief': flags.has('honey.returned') ? null : flags.has('honey.met') ? 'bear' : 'unstarted' });
  const reads: Record<string, (arg: unknown) => unknown> = {
    readState: (): WalkState => ({ x: me.x, z: me.z, hp: 100, kills: 0, flags: [...flags], quests: quests() }),
    readRows: () => ROWS,
    readNodes: () => ({ wren: node }),
    readBox: () => box,
    aim: (arg) => { const at = arg as { x: number; z: number }; me.yaw = Math.atan2(at.z - me.z, at.x - me.x); },
    readCreatures: () => [],
  };
  return {
    pressed, flags,
    evaluate: async <R, A>(read: (arg: A) => R | Promise<R>, arg: A): Promise<R> => {
      const answer = reads[read.name]; if (answer === undefined) throw new Error(`fake page has no ${read.name}`);
      return await Promise.resolve(answer(arg) as R);
    },
    keyboard: {
      press: async (key: string) => {
        pressed.push(key);
        if (key === 'e' && !box.open && Math.hypot(talk.at[0] - me.x, talk.at[2] - me.z) <= talk.radius) {
          node ??= tree.start; // a closed talk reopens at its start (engine 00a9e526)
          const at = tree.nodes.find(row => row.id === node);
          box = { open: true, name: tree.name, text: at?.lines.join(' ') ?? '', choices: offered().map(choice => choice.label), choosing: true };
        } else if (key === 'Escape') box = { ...box, open: false };
        else if (/^[1-9]$/u.test(key) && box.open) {
          const choice = offered()[Number(key) - 1]; box = { ...box, open: false };
          if (choice !== undefined) { for (const flag of choice.sets) flags.add(flag); node = choice.next; }
        }
        await Promise.resolve();
      },
      down: async (key: string) => { walking = key === 'w'; await Promise.resolve(); },
      up: async () => { walking = false; await Promise.resolve(); },
    },
    mouse: { move: async () => { await Promise.resolve(); }, down: async () => { await Promise.resolve(); }, up: async () => { await Promise.resolve(); } },
    waitForTimeout: async (ms: number) => { if (walking) { me.x += Math.cos(me.yaw) * ms / 100; me.z += Math.sin(me.yaw) * ms / 100; } await Promise.resolve(); },
  };
}
/* oxlint-enable typescript/no-unsafe-type-assertion */

describe('walk proof (F27)', () => {
  test('walks to Wren, answers by id, and sees the flag and quest step the server set', async () => {
    const page = fakePage(), proof = walkProof(page, { settle: 50, poll: 1 });
    const open = await proof.talk('wren');
    expect(open).toMatchObject({ talk: 'wren', node: 'hello', name: 'Wren the beekeeper', choices: [{ id: 'accept', label: 'I will help.' }, { id: 'later', label: 'Not now.' }] });
    expect(await proof.choose('accept')).toEqual({ talk: 'wren', choice: 'accept', from: 'hello', to: 'waiting' });
    expect(page.pressed).toContain('1');
    await proof.expectFlags(['honey.met']);
    await proof.expectQuest('honey-thief', 'bear');
    expect(proof.steps.map(step => step.step)).toEqual(['talk', 'choose', 'expectFlags', 'expectQuest']);
  });
  test('answers by the words on screen, or a unique part of them in any case', async () => {
    const page = fakePage(), proof = walkProof(page, { settle: 50, poll: 1 });
    await proof.talk('wren');
    expect((await proof.choose('i will HELP')).to).toBe('waiting');
    page.flags.add('honey.gather-3');
    const open = await proof.talk('wren');
    expect(open).toMatchObject({ node: 'waiting', choices: [{ id: 'turn-in', label: 'Here are three honeycombs.' }] });
    expect(await proof.choose('Here are three honeycombs.')).toEqual({ talk: 'wren', choice: 'turn-in', from: 'waiting', to: null });
    await proof.expectFlags(['honey.met', 'honey.returned'], ['honey.lost']);
    await proof.expectQuest('honey-thief', 'complete');
  });
  test('each refusal names what the page offered instead', async () => {
    const page = fakePage(), proof = walkProof(page, { settle: 20, poll: 1 });
    await expect(proof.talk('bob')).rejects.toThrow(/no talk bob; this shard's talks: wren/u);
    await expect(proof.choose('accept')).rejects.toThrow(/no talk is open; call talk\(<id>\) first/u);
    await proof.talk('wren');
    await expect(proof.choose('turn-in')).rejects.toThrow(/talk wren at node hello has no answer "turn-in" now; it offers: accept \("I will help\."\), later \("Not now\."\)/u);
    await expect(proof.expectFlags(['honey.returned'])).rejects.toThrow(/flags: missing honey\.returned; the server says: none/u);
    await expect(proof.expectQuest('honey-thief', 'complete')).rejects.toThrow(/quest honey-thief is at unstarted, not complete/u);
    await expect(proof.expectQuest('bee', 'complete')).rejects.toThrow(/no quest bee; the server knows: honey-thief/u);
    expect(() => pickChoice({ talk: 'x', node: 'n', name: '', text: '', choices: [{ id: 'a', label: 'Help me' }, { id: 'b', label: 'Help him' }] }, 'help'))
      .toThrow(/"help" matches 2 answers; name one by id/u);
  });
});

describe('wildshard prove <source> <walk.mjs>', () => {
  const root = resolve(import.meta.dirname, '../..'), scratch = mkdtempSync(join(root, 'tmp', 'walk-proof-'));
  afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });
  test('routes a walk script to the walk proof, which needs a dev page to play on', () => {
    const source = join(scratch, 'shard'); mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'shard.config.ts'), 'export {};\n');
    writeFileSync(join(scratch, 'walk.mjs'), 'export default async function walk({ talk, choose }) { await talk("wren"); await choose("accept"); }\n');
    const usage = spawnSync(process.execPath, [join(root, 'bin/wildshard.mjs'), 'prove', source, join(scratch, 'walk.mjs')], { encoding: 'utf8', cwd: root });
    expect(usage.status).toBe(2);
    expect(usage.stderr).toMatch(/usage: wildshard prove <source> <walk\.mjs> --base <url>/u);
    const noDev = spawnSync(process.execPath, [join(root, 'bin/wildshard.mjs'), 'prove', source, join(scratch, 'walk.mjs'), '--base', 'http://127.0.0.1:9/?skipintro'], { encoding: 'utf8', cwd: root });
    expect(noDev.status).toBe(1);
    expect(noDev.stderr).toMatch(/is not a `wildshard dev` page .*run `wildshard dev/u);
  }, 60_000);
});
