// oxlint-disable-next-line import/no-nodejs-modules -- AU21: a recording's name carries the sha1 of its bytes
import { createHash } from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- the encoder reads fixtures and keeps a cache folder
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- the encoder reads fixtures and keeps a cache folder
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- the encoder reads fixtures and keeps a cache folder
import { join, resolve } from 'node:path';
import { measureRecording } from '@wildshard/format/audioMeasure';
import { audioReport } from '@wildshard/format/audioRules';
import { afterEach, expect, it } from 'vitest';
import { audioEncodeLine, contentHashedUrl, encodeMountAudio, findAudioEncoder, readStereoMarks } from './audioEncode';

// AUDIO AU7: the build encodes source recordings to AU5's targets, sound effects mono unless marked stereo, and a
// rebuild takes every encoded file from the cache.

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function folder(): string { const root = mkdtempSync(join(tmpdir(), 'sharddev-audio-')); roots.push(root); return root; }

const fixtures = resolve(import.meta.dirname, '../../test/fixtures/shard-assets');
/** A 16-bit PCM WAV of a sine per channel (a different pitch per channel, so stereo really is stereo). */
function wav(rate: number, channels: number, seconds: number): Uint8Array {
  const frames = Math.round(rate * seconds), data = frames * channels * 2, bytes = new Uint8Array(44 + data), view = new DataView(bytes.buffer);
  const tag = (at: number, text: string): void => { for (let i = 0; i < 4; i++) bytes[at + i] = text.codePointAt(i) ?? 0; };
  tag(0, 'RIFF'); view.setUint32(4, 36 + data, true); tag(8, 'WAVE'); tag(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, data, true);
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < channels; channel++)
    view.setInt16(44 + (frame * channels + channel) * 2, Math.round(12_000 * Math.sin(2 * Math.PI * (440 + 220 * channel) * frame / rate)), true);
  return bytes;
}

const sources = [
  { url: '/assets/sfx/test/sample.wav', bytes: new Uint8Array(readFileSync(resolve(fixtures, 'sample.wav'))) },
  { url: '/assets/sfx/test/hit.wav', bytes: wav(44_100, 2, 0.8) },
  { url: '/assets/music/test/loop.wav', bytes: wav(44_100, 2, 3) },
  { url: '/shardfiles/test/discovery.json', bytes: new TextEncoder().encode('{}') },
];
const encoder = await findAudioEncoder();

it.skipIf(encoder === null)('encodes the fixtures and a stereo music file to AU5 targets, then a rebuild encodes nothing', async () => {
  const cacheRoot = folder(), first = await encodeMountAudio(sources, { cacheRoot });
  // A recording with no content hash in its name keeps its URL: the engine versions it by its served bytes (`?v=`).
  expect(first.mounts.map(mount => mount.url)).toEqual(sources.map(mount => mount.url));
  expect(first.mounts[3]?.bytes).toBe(sources[3]?.bytes);
  const rows = first.mounts.slice(0, 3).map(({ url, bytes }) => measureRecording(url, url, bytes));
  expect(rows.map(row => [row.codec, row.channels, row.sampleRate, row.reason])).toEqual([['aac', 1, 48_000, undefined], ['aac', 1, 48_000, undefined], ['aac', 2, 48_000, undefined]]);
  const report = audioReport(rows, { slug: 'test', waiver: undefined, today: '2026-11-13' });
  expect(report.findings).toEqual([]);
  expect(report.level).toBe('green');
  expect(first.stats).toMatchObject({ files: 3, encoded: 3, cached: 0, kept: 0 });
  const second = await encodeMountAudio(sources, { cacheRoot });
  expect(second.stats).toMatchObject({ files: 3, encoded: 0, cached: 3 });
  expect(second.mounts.map(mount => mount.bytes)).toEqual(first.mounts.map(mount => mount.bytes));
  // The encoder itself is deterministic: a fresh cache writes the same bytes, so the cache masks nothing.
  const fresh = await encodeMountAudio(sources, { cacheRoot: folder() });
  expect(fresh.stats).toMatchObject({ encoded: 3, cached: 0 });
  expect(fresh.mounts.map(mount => mount.bytes)).toEqual(first.mounts.map(mount => mount.bytes));
  expect(audioEncodeLine('test', second.stats, second.encoder)).toMatch(/^audio: test 3 recordings, [\d.]+ MB before, [\d.]+ MB after \(0 encoded, 3 from cache, 0 already at target; aac(?:_at)?\)$/u);
});

it.skipIf(encoder === null)('keeps a marked sound effect stereo and ships an at-target m4a as it is', async () => {
  const cacheRoot = folder(), hit = sources[1];
  if (hit === undefined) throw new Error('fixture');
  const stereo = await encodeMountAudio([hit], { cacheRoot, stereo: new Set([hit.url]) });
  const [encoded] = stereo.mounts;
  if (encoded === undefined) throw new Error('no output');
  expect(measureRecording(encoded.url, '', encoded.bytes).channels).toBe(2);
  const again = await encodeMountAudio([{ url: '/assets/sfx/test/hit-stereo.m4a', bytes: encoded.bytes }], { cacheRoot, stereo: new Set(['/assets/sfx/test/hit-stereo.m4a']) });
  expect(again.stats).toMatchObject({ kept: 1, encoded: 0 });
  expect(again.mounts[0]?.bytes).toBe(encoded.bytes);
  // Unmarked, the same stereo sound effect is encoded again to mono.
  const mono = await encodeMountAudio([{ url: '/assets/sfx/test/hit-stereo.m4a', bytes: encoded.bytes }], { cacheRoot });
  expect(mono.stats).toMatchObject({ kept: 0, encoded: 1 });
  expect(measureRecording('/assets/sfx/x.m4a', '', mono.mounts[0]?.bytes ?? new Uint8Array()).channels).toBe(1);
});

it.skipIf(encoder === null)('refuses a malformed source with its URL', async () => {
  const bytes = new Uint8Array(readFileSync(resolve(fixtures, 'malformed.wav')));
  await expect(encodeMountAudio([{ url: '/assets/sfx/test/malformed.wav', bytes }], { cacheRoot: folder() })).rejects.toThrow(/malformed\.wav|ffprobe|ffmpeg/u);
});

it('ships the source bytes and says so when the host has no ffmpeg', async () => {
  const result = await encodeMountAudio(sources, { encoder: null, cacheRoot: folder() });
  expect(result.mounts.map(mount => mount.bytes)).toEqual(sources.map(mount => mount.bytes));
  expect(audioEncodeLine('test', result.stats, null)).toContain('3 not encoded: no ffmpeg on PATH');
});

it('refuses a stereo mark on music', () => {
  const project = folder();
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'audio-stereo.json'), JSON.stringify({ version: 1, stereo: ['/assets/music/a.m4a'] }));
  expect(() => readStereoMarks(project)).toThrow(/sound effects under \/assets\/sfx/u);
  expect(readStereoMarks(folder()).size).toBe(0);
});

// AUDIO AU21: a content-hashed recording name is served immutable for a year, so it must name the bytes it serves.
const sha1 = (bytes: Uint8Array): string => createHash('sha1').update(bytes).digest('hex');
const hashed = (dir: string, stem: string, ext: string, bytes: Uint8Array): { url: string; bytes: Uint8Array } => ({ url: `${dir}${stem}-${sha1(bytes).slice(0, 8)}.${ext}`, bytes });
const text = (bytes: Uint8Array | undefined): string => new TextDecoder().decode(bytes);

it('names a content-hashed URL by the bytes it serves', () => {
  const bytes = new TextEncoder().encode('encoded'), one = sha1(bytes), two = createHash('sha256').update(bytes).digest('hex');
  expect(contentHashedUrl('/assets/music/piano/island-calm-05125ed8.m4a', bytes)).toBe(`/assets/music/piano/island-calm-${one.slice(0, 8)}.m4a`);
  expect(contentHashedUrl('/assets/sfx/x/bed-1-0123456789abcdef.wav', bytes)).toBe(`/assets/sfx/x/bed-1-${one.slice(0, 16)}.wav`);
  expect(contentHashedUrl(`/assets/sfx/x/${'0'.repeat(64)}.m4a`, bytes)).toBe(`/assets/sfx/x/${two}.m4a`);
  expect(contentHashedUrl('/assets/sfx/x/forest-2.m4a', bytes)).toBe('/assets/sfx/x/forest-2.m4a');
});

it.skipIf(encoder === null)('gives a re-encoded hashed recording a new URL every reference reads, and an untouched one keeps its own', async () => {
  const cacheRoot = folder(), music = '/assets/music/test/', sfx = '/assets/sfx/test/';
  const loop = hashed(music, 'loop', 'wav', wav(44_100, 2, 3)), hit = hashed(sfx, 'hit', 'wav', wav(44_100, 1, 0.5));
  // An m4a already at AU5's target ships as it is, so it keeps its URL.
  const atTarget = (await encodeMountAudio([{ url: `${sfx}ready.wav`, bytes: wav(44_100, 1, 0.5) }], { cacheRoot })).mounts[0]?.bytes ?? new Uint8Array();
  const ready = hashed(sfx, 'ready', 'm4a', atTarget);
  const name = (url: string): string => url.slice(url.lastIndexOf('/') + 1);
  const json = (url: string, value: unknown): { url: string; bytes: Uint8Array } => ({ url, bytes: new TextEncoder().encode(JSON.stringify(value)) });
  const sfxJson = json(`${sfx}sfx.json`, { beds: { a: { file: name(hit.url) } }, oneshots: { b: { files: [name(ready.url), name(hit.url)] } } });
  const musicJson = json(`${music}music.json`, { slots: { a: { calm: name(loop.url) } } });
  // Another folder's JSON names a recording by URL only; a file name outside its own folder is not its to rewrite.
  const rows = json('/shardfiles/test/rows.json', { calm: loop.url, other: name(hit.url) });
  const untouched = json('/assets/sfx/test/notes.json', { none: true });
  const input = [loop, hit, ready, sfxJson, musicJson, rows, untouched];
  const { mounts, renamed, stats } = await encodeMountAudio(input, { cacheRoot });
  const by = new Map(mounts.map(mount => [mount.url, mount.bytes]));
  expect(stats).toMatchObject({ files: 3, kept: 1, renamed: 2 });
  // Re-encoded: each new URL names its new bytes, and the old URL is gone from the product.
  for (const source of [loop, hit]) {
    const next = renamed.get(source.url);
    expect(next).toBeDefined();
    expect(next).not.toBe(source.url);
    expect(by.has(source.url)).toBe(false);
    const served = by.get(next ?? '');
    expect(served).toBeDefined();
    expect(name(next ?? '')).toBe(`${name(source.url).replace(/-[a-f0-9]{8}\.wav$/u, '')}-${sha1(served ?? new Uint8Array()).slice(0, 8)}.wav`);
  }
  // Untouched: same URL, same bytes.
  expect(renamed.has(ready.url)).toBe(false);
  expect(by.get(ready.url)).toBe(ready.bytes);
  // Every reference the build makes reads the new URL.
  const newHit = name(renamed.get(hit.url) ?? ''), newLoop = renamed.get(loop.url) ?? '';
  expect(JSON.parse(text(by.get(sfxJson.url)))).toEqual({ beds: { a: { file: newHit } }, oneshots: { b: { files: [name(ready.url), newHit] } } });
  expect(JSON.parse(text(by.get(musicJson.url)))).toEqual({ slots: { a: { calm: name(newLoop) } } });
  expect(JSON.parse(text(by.get(rows.url)))).toEqual({ calm: newLoop, other: name(hit.url) });
  expect(by.get(untouched.url)).toBe(untouched.bytes);
  // The invariant: no hashed recording URL is served with bytes other than the ones the source holds under it.
  const before = new Map(input.map(mount => [mount.url, mount.bytes]));
  for (const mount of mounts) if (/-[a-f0-9]{8,64}\.[a-z0-9]+$/u.test(mount.url) && before.has(mount.url)) expect(mount.bytes).toEqual(before.get(mount.url));
  // A rebuild from the cache lands on the same names.
  expect((await encodeMountAudio(input, { cacheRoot })).renamed).toEqual(renamed);
});

it('refuses a built product that still names a renamed recording', async () => {
  const { assertNoRenamedAudioNames } = await import('./project');
  const product = folder(), renamed = new Map([['/assets/sfx/test/hit-0123abcd.m4a', '/assets/sfx/test/hit-89abcdef.m4a']]);
  mkdirSync(join(product, 'sections'), { recursive: true });
  writeFileSync(join(product, 'sections', 'ok.json'), JSON.stringify({ file: 'hit-89abcdef.m4a' }));
  writeFileSync(join(product, 'hit-0123abcd.m4a'), 'a recording is not read');
  expect(() => assertNoRenamedAudioNames(product, renamed)).not.toThrow();
  writeFileSync(join(product, 'sections', 'stale.json'), JSON.stringify({ file: 'hit-0123abcd.m4a' }));
  expect(() => assertNoRenamedAudioNames(product, renamed)).toThrow('sections/stale.json names /assets/sfx/test/hit-0123abcd.m4a, which the build serves as /assets/sfx/test/hit-89abcdef.m4a (AU21)');
});
