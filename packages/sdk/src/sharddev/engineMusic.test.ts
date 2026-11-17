// AUDIO AU18 (J304): `wildshard build` prints the engine music a shard plays, derived from its audio rows by name with
// the installed engine's own tables, and refuses a name the engine's one style lacks.
import { expect, test } from 'vitest';
import { ENGINE_MUSIC_STYLE, musicManifest } from '@wildshard/engine/audio/bootAudio';
import { withAssetTables } from '@wildshard/engine/boot/tables';
import { ENGINE_TABLES, engineMusicLine } from './engineMusic';

// Driftwood's rows: its `island` slot is the engine style's (set `base`), and it boots the title.
const music = { id: 'driftwood', base: 'island', slots: ['island'], bootSlots: ['title', 'island'], controlTension: 'late', sets: { island: 'base' },
  catalogue: { mode: 'bank', extraStings: [], stingSets: {} } };
const samples = { bed: 'island', set: 'fixture-isle', loopGains: { island: 0.5 },
  catalogue: { inventoryOmitSlots: [], loopOrder: [], overlaySamples: true, ownMusic: false, priorityOwn: false } };
const section = (rows: Record<string, unknown>): unknown => ({ audio: { music: { ...music, ...rows }, samples } });

test("Driftwood's line names the piano title, island calm and tension, and the engine stings", () => {
  const piano = withAssetTables(ENGINE_TABLES, () => musicManifest(ENGINE_MUSIC_STYLE));
  const island = piano?.slots['island'], title = piano?.slots['title'];
  const want = [island?.calm, island?.tension, title?.calm, ...Object.values(piano?.stings ?? {})];
  const line = engineMusicLine('driftwood-isle', section({}));
  expect(line).toMatch(new RegExp(`^driftwood-isle: engine music: ${want.length} files, \\d+\\.\\d\\d MB \\(`, 'u'));
  for (const file of want) expect(line).toContain(file);
});

test('a shard with no audio section prints nothing; one with no music prints no files', () => {
  expect(engineMusicLine('dunes', undefined)).toBeUndefined();
  expect(engineMusicLine('dunes', { audio: { samples } })).toBe('dunes: engine music: 0 files, 0.00 MB');
});

test('a slot the engine style lacks refuses, naming the shard and the slot', () => {
  expect(() => engineMusicLine('fixture', section({ base: 'harbor', slots: ['harbor'], bootSlots: ['title', 'harbor'], sets: { harbor: 'base' } })))
    .toThrow(/^fixture: .*piano style lacks: slot harbor$/u);
});
