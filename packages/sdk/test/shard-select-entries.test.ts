// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { setDev } from '../src/client/engine/core/devMode';
import { authoredRows } from '../src/client/engine/ui/authoredDebugRows';
import { jsonSlot } from '../src/client/engine/saves/slots';
import type { ShardManifest } from '../src/client/game/shard/manifest';
import { installShards, shards } from '../src/client/game/shard/list';
import { buildTitleDeck, titleCards, type TitleCard } from '../src/client/game/titleDeck';
import { SHARDS } from '../src/shards.generated';
import plots from '../src/shards/open-plots/outputs.json' with { type: 'json' };
import inkManifest from '../src/shards/ink-cel-valley/manifest.json' with { type: 'json' };
import pastelManifest from '../src/shards/pastel-plain/manifest.json' with { type: 'json' };
import productBootSources from '../src/shards/open-plots/data/nightMarketBootSources.json' with { type: 'json' };
import { chunkFiles } from '../src/client/engine/boot/manifest';
import { bootSourceFiles } from '../src/client/engine/boot/filePolicy';
import { bootFetches } from '../src/client/engine/boot/prefetch';
import { installAssetFixture } from './fixtures/bootSetup';

// G531 / QD7 LD5: SHARD SELECT shows one ENTER WORLD per shard, its shardfile, in the public build and in Developer. The
// LEGACY / SHARDFILE pair, its Developer row and the saved per-tab choice are gone.
const card = (slug: TitleCard['slug']): TitleCard => ({ slug, name: slug, label: slug, thumbnail: '', heroPortrait: '', heroLandscape: '' });
const CARDS = [card('nine-dragon-stack'), card('pine-hollow'), card('far-reach')];
const decks: ReturnType<typeof buildTitleDeck>[] = [];
const paintFrames = (): Promise<void> => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); }); });

function deck(developer = true): { root: HTMLElement; select: (i: number) => void; entered: string[] } {
  installShards([]);
  const entered: string[] = [];
  const built = buildTitleDeck({ cards: CARDS, active: null, onEnter: (c) => { entered.push(c.slug); }, onExplore: () => undefined, onSettings: () => undefined,
    mode: () => ({ developer, devserver: developer }) });
  decks.push(built);
  document.body.append(built.root);
  return { root: built.root, select: (i) => { built.select(i, false); }, entered };
}
/** the entry buttons a player can see on the selected card */
const shown = (root: HTMLElement): string[] => [...root.querySelectorAll<HTMLButtonElement>('.ws-menu-modes button')]
  .filter((button) => button.hidden === false).map((button) => button.querySelector('b')?.textContent ?? '');
const play = (root: HTMLElement): void => { root.querySelector<HTMLButtonElement>('.ws-menu-play')?.click(); };

afterEach(() => { for (const built of decks.splice(0)) built.dispose(); setDev(false); document.body.replaceChildren(); vi.unstubAllGlobals(); });

test.each([true, false])('developer %s: every card shows only ENTER WORLD and enters it once', async developer => {
  setDev(developer);
  for (const [i, c] of CARDS.entries()) {
    const visit = deck(developer); visit.select(i);
    expect(shown(visit.root)).toEqual(['Enter world']);
    expect(visit.root.querySelector('.ws-menu-shardfile')).toBeNull();
    play(visit.root);
    expect(visit.entered).toEqual([]);
    expect(document.querySelector('[data-navigation] [data-el="slug"]')?.textContent).toBe(c.name);
    await paintFrames();
    expect(visit.entered).toEqual([c.slug]);
    decks.at(-1)?.dispose();
  }
  expect([...authoredRows].some(row => row.id === 'legacyShardButtons')).toBe(false);
});

test('a saved Legacy shard buttons pick from before LD5 resurrects nothing', async () => {
  jsonSlot('debug.global.legacyShardButtons', 'device').write('on');
  setDev(true);
  const d = deck(); d.select(0);
  expect(shown(d.root)).toEqual(['Enter world']);
  expect([...authoredRows].some(row => row.id === 'legacyShardButtons')).toBe(false);
  play(d.root); await paintFrames();
  expect(d.entered).toEqual(['nine-dragon-stack']);
});

test('a locked card offers no entry', () => {
  setDev(false);
  const d = deck(false), locked = { ...card('_template'), badge: 'Developer only' as const };
  const built = buildTitleDeck({ cards: [locked], active: null, onEnter: () => { throw new Error('entered a locked card'); },
    onExplore: () => undefined, onSettings: () => undefined, mode: () => ({ developer: false, devserver: false }) });
  decks.push(built); document.body.append(built.root);
  expect(shown(built.root)).toEqual(['Coming soon']);
  expect(built.root.querySelector<HTMLButtonElement>('.ws-menu-play')?.disabled).toBe(true);
  expect(shown(d.root)).toEqual(['Enter world']);
});

test.each(['driftwood-isle', 'nalati-grasslands', 'sunscar-dunes', 'far-reach', 'nine-dragon-stack', 'pine-hollow'] as const)(
  '%s card enters through ENTER WORLD, and no card is a frozen copy', async (slug) => {
    const manifests = SHARDS;
    installShards(manifests); setDev(true);
    expect(titleCards(true).some(candidate => candidate.slug.endsWith('-legacy'))).toBe(false);
    const choice = titleCards(true).find(candidate => candidate.slug === slug);
    const manifest = manifests.find(candidate => candidate.slug === slug);
    if (choice === undefined || manifest === undefined) throw new Error('Missing real shard card');
    const entered: string[] = [];
    const built = buildTitleDeck({cards: [choice], active: null, onEnter: (selected) => { entered.push(selected.slug); },
      onExplore: () => undefined, onSettings: () => undefined, mode: () => ({developer: true, devserver: true})});
    decks.push(built); document.body.append(built.root);
    try {
      expect(shown(built.root)).toEqual(['Enter world']);
      play(built.root); await paintFrames();
      expect(entered).toEqual([slug]);
    } finally { installShards([]); }
  });


const buildOutPlots = ['frostline-peaks', 'lantern-bayou', 'ember-forge', 'mosslight-ruins', 'coral-drift'];
/** The selection policy comes from its authored metadata, independently of
 * native geometry products needed to regenerate full discovery bindings. */
function selectionManifests(): readonly ShardManifest[] {
  const flags = new Map(plots.outputs.map(output => [output.slug, output.manifest.shardSelect]));
  flags.set(inkManifest.slug, inkManifest.shardSelect);
  flags.set(pastelManifest.slug, pastelManifest.shardSelect);
  const result: ShardManifest[] = [];
  for (const manifest of SHARDS) {
    const flag = flags.get(manifest.slug);
    result.push(flag === undefined ? manifest : { ...manifest, shardSelect: flag });
  }
  return result;
}
test('G991 pins six public Shard Select cards and only two Developer templates', () => {
  const registered = selectionManifests();
  installShards(registered);
  const main = ['driftwood-isle', 'nalati-grasslands', 'pine-hollow', 'nine-dragon-stack', 'far-reach', 'sunscar-dunes'];
  const developer = [...main, '_template', 'blender-template'];
  expect(titleCards(false).map(item => item.slug).sort()).toEqual(main.sort());
  expect(titleCards(true).map(item => item.slug).sort()).toEqual(developer.sort());
  expect(titleCards(true)).toHaveLength(8);
  for (const slug of ['_template', 'blender-template']) {
    expect(titleCards(false).some(item => item.slug === slug)).toBe(false);
    expect(titleCards(true).find(item => item.slug === slug)?.badge).toBe('Developer only');
  }
  const plotSlugs = new Set(plots.outputs.map(item => item.slug));
  expect(plotSlugs.size).toBe(plots.outputs.length);
  for (const output of plots.outputs) expect(output.manifest.shardSelect).toBe(false);
  for (const manifest of registered.filter(item => plotSlugs.has(item.slug)
    || item.slug === 'ink-cel-valley' || item.slug === 'pastel-plain')) {
    expect(manifest.shardSelect).toBe(false);
  }
  expect(SHARDS.filter(item => plotSlugs.has(item.slug)).map(item => item.slug).sort()).toEqual([...plotSlugs].sort());
  expect(shards()).toHaveLength(SHARDS.length);
  installShards([]);
});

test.each(buildOutPlots)('%s retains standalone loading and card metadata after exclusion', async idea => {
  await installAssetFixture();
  installShards(selectionManifests());
  setDev(false);
  const slug = `open-plot-${idea}`, manifest = SHARDS.find(item => item.slug === slug);
  if (manifest === undefined) throw new Error('Missing standalone plot');
  expect(titleCards(false).some(item => item.slug === slug)).toBe(false);
  expect(titleCards(true).some(item => item.slug === slug)).toBe(false);
  // A local host fixture still exercises standalone admission and the original
  // card metadata; the shipping manifest remains excluded from both decks.
  installShards([{ ...manifest, shardSelect: true }]);
  const choice = titleCards(false).find(item => item.slug === slug);
  if (choice === undefined) throw new Error('Missing fixture card');
  const boot = manifest.boot;
  if (boot?.sources === undefined) throw new Error('Missing authored native-product boot inventory');
  // These levels load world bytes through their admitted shardfile, exactly as
  // Night Market does. They have no predecessor's eager public-asset pack.
  for (const tier of ['phone', 'desktop'] as const) for (const mode of ['img', 'ktx2'] as const) {
    const sources = bootSourceFiles(boot.sources, tier, mode);
    expect(sources).toEqual(productBootSources.tiers[tier]);
    expect(bootFetches(manifest, sources)).toEqual([]);
  }
  expect(chunkFiles(manifest)).toEqual(productBootSources.tiers.desktop);
  expect(manifest.load).toBeUndefined();
  expect(manifest.shardfile).toBe(`/shardfiles/${slug}/shard.json`);
  expect(choice.thumbnail).toBe(manifest.card.thumb);
  expect(choice.heroPortrait).toBe(manifest.card.portrait);
  expect(choice.heroLandscape).toBe(manifest.card.landscape);
  expect(manifest.card.thumb).toContain(`/open-plots/thumbs/${idea}.jpg`);
  const entered: string[] = [];
  const built = buildTitleDeck({ cards: [choice], active: null,
    onEnter: (selected) => { entered.push(selected.slug); },
    onExplore: () => undefined, onSettings: () => undefined,
    mode: () => ({ developer: false, devserver: false }) });
  decks.push(built); document.body.append(built.root);
  expect(shown(built.root)).toEqual(['Enter world']);
  play(built.root); await paintFrames();
  expect(entered).toEqual([slug]);
  installShards([]);
});

test('a playable level without authored boot sources still refuses before pack construction', () => {
  expect(() => chunkFiles({})).toThrow('Level boot has no authored asset sources');
});

test('the backdrop is the hero over the card\'s own thumbnail, so a late hero never leaves it black', () => {
  installShards([]);
  const art = (slug: TitleCard['slug']): TitleCard => Object.assign(card(slug), { thumbnail: `/thumbs/${slug}.jpg`, heroPortrait: `/heroes/${slug}-portrait.jpg`, heroLandscape: `/heroes/${slug}-landscape.jpg` });
  const cards = [art('driftwood-isle'), art('pine-hollow')];
  const built = buildTitleDeck({ cards, active: null, onEnter: () => undefined, onExplore: () => undefined, onSettings: () => undefined, mode: () => ({ developer: true, devserver: true }) });
  document.body.append(built.root);
  vi.stubGlobal('innerWidth', 402); vi.stubGlobal('innerHeight', 874);
  built.select(1, false);
  const hero = built.root.querySelector<HTMLElement>('.ws-menu-hero');
  expect(hero?.style.backgroundImage.replaceAll('"', "'")).toBe("url('/heroes/pine-hollow-portrait.jpg'), url('/thumbs/pine-hollow.jpg')");
});


test('Settings responds on pointerup once, keeps keyboard click, and retires its listeners', () => {
  const settings = vi.fn<() => void>();
  const built = buildTitleDeck({ cards: CARDS, active: null, onEnter: () => undefined,
    onExplore: () => undefined, onSettings: settings, mode: () => ({ developer: true, devserver: true }) });
  const button = built.root.querySelector<HTMLButtonElement>('.ws-menu-settings');
  if (button === null) throw new Error('missing Settings');
  button.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }));
  expect(settings).toHaveBeenCalledTimes(1);
  button.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
  expect(settings).toHaveBeenCalledTimes(1);
  button.click(); // Keyboard and assistive-technology clicks have no pointer detail.
  expect(settings).toHaveBeenCalledTimes(2);
  built.dispose();
  button.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
  button.click();
  expect(settings).toHaveBeenCalledTimes(2);
});

test('shared title actions toggle once per tap and disabled entry buttons stay inert', async () => {
  const entered = vi.fn<() => void>(), toggled = vi.fn<() => void>();
  const built = buildTitleDeck({ cards: CARDS, active: null, onEnter: entered,
    onExplore: () => undefined, onSettings: () => undefined, mode: () => ({ developer: true, devserver: true }) });
  const toggle = document.createElement('button');
  built.onTap(toggle, toggled);
  toggle.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
  toggle.dispatchEvent(new MouseEvent('click', { detail: 1 }));
  expect(toggled).toHaveBeenCalledTimes(1);
  toggle.dispatchEvent(new PointerEvent('pointerup', { button: 2 }));
  expect(toggled).toHaveBeenCalledTimes(1);
  const playButton = built.root.querySelector<HTMLButtonElement>('.ws-menu-play');
  if (playButton === null) throw new Error('missing entry button');
  playButton.disabled = true;
  playButton.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
  expect(entered).not.toHaveBeenCalled();
  playButton.disabled = false;
  playButton.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
  playButton.dispatchEvent(new MouseEvent('click', { detail: 1 }));
  expect(entered).not.toHaveBeenCalled();
  await paintFrames();
  expect(entered).toHaveBeenCalledTimes(1);
  built.dispose();
});

test('the click iOS sends after the title SHARD SELECT tap enters no world and moves no card (QC2)', async () => {
  const entered = vi.fn<() => void>();
  const built = buildTitleDeck({ cards: CARDS, active: null, onEnter: entered,
    onExplore: () => undefined, onSettings: () => undefined, mode: () => ({ developer: true, devserver: true }) });
  decks.push(built); document.body.append(built.root);
  // the title's SHARD SELECT answers its tap on pointerup and swaps to the picker (src/client/game/mainMenu.ts)
  const shardSelect = document.createElement('button'), opened = vi.fn<() => void>();
  built.onTap(shardSelect, opened);
  shardSelect.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
  expect(opened).toHaveBeenCalledTimes(1);
  // WebKit hit-tests the synthesized click again: ENTER WORLD, a card or a dot is now under the finger
  const playButton = built.root.querySelector<HTMLButtonElement>('.ws-menu-play'), cardButton = built.root.querySelector<HTMLButtonElement>('.ws-menu-card[data-i="1"]');
  const dot = built.root.querySelector<HTMLElement>('.ws-menu-dots i[data-i="2"]');
  if (playButton === null || cardButton === null || dot === null) throw new Error('missing picker controls');
  const before = built.index;
  for (const target of [playButton, cardButton, dot]) target.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
  await paintFrames();
  expect(entered).not.toHaveBeenCalled();
  expect(built.index).toBe(before);
  // a new click elsewhere in the same half second is the player's own gesture: the dot selects its card
  dot.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true, clientX: 200, clientY: 300 }));
  expect(built.index).toBe(2);
  // a keyboard press (no pointer detail) right after still enters, once
  playButton.click();
  await paintFrames();
  expect(entered).toHaveBeenCalledTimes(1);
});
