// oxlint-disable-next-line import/no-nodejs-modules -- the encoder reads fixtures and keeps a cache folder
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- the encoder reads fixtures and keeps a cache folder
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- the encoder reads fixtures and keeps a cache folder
import { join, resolve } from 'node:path';
import { measureRecording } from '@wildshard/format/audioMeasure';
import { audioReport } from '@wildshard/format/audioRules';
import { afterEach, expect, it } from 'vitest';
import { audioEncodeLine, encodeMountAudio, findAudioEncoder, readStereoMarks } from './audioEncode';

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
  // Each recording keeps its URL: the shard's rows and fence list name it.
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
