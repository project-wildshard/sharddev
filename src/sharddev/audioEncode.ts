// oxlint-disable-next-line import/no-nodejs-modules -- The build runs the host's ffmpeg to encode recordings.
import { execFile } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- The build host keys encoded recordings by exact content.
import { createHash, randomBytes } from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- The encode cache lives outside the authored product.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The default cache is the existing build-cache root.
import { availableParallelism, homedir, release, tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Cache paths use only trusted roots and hashes.
import { join, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- execFile's promise form.
import { promisify } from 'node:util';
import * as v from 'valibot';
import { measureRecording } from '@wildshard/format/audioMeasure';
import { AUDIO_RULES, audioReport } from '@wildshard/format/audioRules';

// AUDIO AU7 (meta docs/plans/AUDIO-PLAN.md, J299): the build re-encodes every source recording a shard mounts (wav,
// flac, aiff or m4a under /assets/music or /assets/sfx) to AU5's targets: AAC-LC 48 kHz in .m4a at the bitrate cap
// for its role and channels (format's AUDIO_RULES). AudioToolbox `aac_at` on macOS, ffmpeg's `aac` elsewhere. Sound
// effects go mono unless the shard source marks them stereo (`audio-stereo.json`); music keeps its channels. An AAC
// file that already passes AU5's per-file check at the right channel count ships as it is, so no file is encoded
// twice. Every recording keeps its URL (a `.wav` mount serves AAC bytes), because the shard's rows, fence list and
// code name that URL. Encoded bytes are cached by source hash, role, channel mark, AU5's rules, this encoder's code
// and the host encoder's identity (ffmpeg version, encoder, platform, and the macOS release for AudioToolbox), so a
// rebuild encodes nothing and a different encoder never reads another's bytes. AudioToolbox's stereo floor is 64
// kbps, so a stereo sound effect (48 kbps) takes ffmpeg's `aac` on every host. The 180 s rule is AU5's report's to
// judge (a waiver may cover it), so the encoder ignores it.

/** Which encoder the build found, and the identity its cache key carries. */
export interface AudioEncoder {
  readonly ffmpeg: string;
  readonly ffprobe: string;
  readonly codec: 'aac_at' | 'aac';
  readonly identity: string;
}

/** What one encode pass did, for the build's log line. */
export interface AudioEncodeStats {
  readonly files: number;
  readonly encoded: number;
  readonly cached: number;
  readonly kept: number;
  readonly unencoded: number;
  readonly before: number;
  readonly after: number;
}

export interface AudioEncodeOptions {
  /** Sound-effect URLs the source marks stereo (`audio-stereo.json`). */
  readonly stereo?: ReadonlySet<string>;
  readonly cacheRoot?: string;
  /** `null` is no encoder on this host; undefined finds one. */
  readonly encoder?: AudioEncoder | null;
}

interface Mount { readonly url: string; readonly bytes: Uint8Array }
type Role = 'music' | 'sfx';

const SOURCE = /^\/assets\/(?<role>music|sfx)\/.+\.(?<ext>m4a|wav|flac|aiff?)$/u;
const SCHEMA = 'audio-encode/1';
const MAX_BYTES = 256_000_000;
const MB = 1_000_000;
const AAC_AT_STEREO_FLOOR = 64;
const RATE_STEP = 8;
const execFileAsync = promisify(execFile);
async function run(file: string, args: readonly string[]): Promise<string> {
  try { return (await execFileAsync(file, [...args], { maxBuffer: 4_000_000 })).stdout; }
  catch (error) {
    const stderr = typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr).trim().split('\n').slice(-2).join(' ') : '';
    throw new Error(`${file} ${args.slice(0, 2).join(' ')}: ${stderr === '' ? String(error) : stderr}`, { cause: error });
  }
}
const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Whether a mount URL is a source recording the build encodes. */
export function isSourceRecordingUrl(url: string): boolean { return SOURCE.test(url); }


let found: Promise<AudioEncoder | null> | undefined;
/** The host's encoder: `aac_at` when ffmpeg on macOS has it, else ffmpeg's `aac`; null with no ffmpeg on PATH. */
export function findAudioEncoder(): Promise<AudioEncoder | null> {
  found ??= (async () => {
    const ffmpeg = process.env['WILDSHARD_FFMPEG'] ?? 'ffmpeg', ffprobe = process.env['WILDSHARD_FFPROBE'] ?? 'ffprobe';
    try {
      const version = (await run(ffmpeg, ['-hide_banner', '-version'])).split('\n')[0]?.trim() ?? '';
      await run(ffprobe, ['-hide_banner', '-version']);
      const toolbox = process.platform === 'darwin' && /\baac_at\b/u.test(await run(ffmpeg, ['-hide_banner', '-encoders']));
      const codec = toolbox ? 'aac_at' : 'aac';
      return { ffmpeg, ffprobe, codec, identity: `${version} ${codec} ${process.platform}-${process.arch}${toolbox ? ` ${release()}` : ''}` };
    } catch { return null; }
  })();
  return found;
}

const StereoSchema = v.strictObject({ version: v.literal(1), stereo: v.array(v.pipe(v.string(), v.regex(/^\/assets\/sfx\/.+\.(?:m4a|wav|flac|aiff?)$/u, 'audio-stereo.json names sound effects under /assets/sfx/'))) });
/** The sound effects a shard source marks stereo: `audio-stereo.json` beside `mounts.json`, if any. */
export function readStereoMarks(project: string): ReadonlySet<string> {
  const file = resolve(project, 'audio-stereo.json');
  return existsSync(file) ? new Set(v.parse(StereoSchema, JSON.parse(readFileSync(file, 'utf8'))).stereo) : new Set();
}

/** AU5's per-file findings the encoder answers for: format and bitrate, not the shard's budget or the 180 s rule. */
function missedTargets(row: Parameters<typeof audioReport>[0][number]): ReturnType<typeof audioReport>['findings'] {
  return audioReport([row], { slug: '', waiver: undefined, today: '' }).findings.filter(finding => finding.rule === 'format' || finding.rule === 'bitrate');
}

/** Whether AAC bytes already meet AU5 at the channel count the build would pick, so encoding them again only loses. */
function alreadyAtTarget(url: string, bytes: Uint8Array, role: Role, stereo: boolean): boolean {
  const row = measureRecording(url, sha(bytes), bytes);
  if (row.codec !== 'aac' || row.reason !== undefined) return false;
  if (role === 'sfx' && !stereo && row.channels !== 1) return false;
  return missedTargets(row).length === 0;
}

function readCache(root: string, key: string): Uint8Array | undefined {
  try {
    const meta: unknown = JSON.parse(readFileSync(resolve(root, `${key}.json`), 'utf8'));
    if (typeof meta !== 'object' || meta === null || !('key' in meta) || meta.key !== key || !('hash' in meta)) return undefined;
    const bytes = readFileSync(resolve(root, `${key}.m4a`));
    return sha(bytes) === meta.hash ? new Uint8Array(bytes) : undefined;
  } catch { return undefined; }
}

function writeCache(root: string, key: string, bytes: Uint8Array): void {
  const suffix = `.${process.pid}.${randomBytes(8).toString('hex')}.tmp`, body = resolve(root, `${key}.m4a`), meta = resolve(root, `${key}.json`);
  try {
    writeFileSync(body + suffix, bytes, { flag: 'wx' }); renameSync(body + suffix, body);
    writeFileSync(meta + suffix, JSON.stringify({ key, hash: sha(bytes) }), { flag: 'wx' }); renameSync(meta + suffix, meta);
  } catch { /* Storage availability does not change the build. */ }
  finally { for (const file of [body + suffix, meta + suffix]) rmSync(file, { force: true }); }
}

/** A private work folder under the cache root, or under the system's temporary folder when the cache is not writable. */
function workFolder(root: string): string {
  try { const work = resolve(root, `work-${process.pid}-${randomBytes(8).toString('hex')}`); mkdirSync(work, { recursive: true }); return work; }
  catch { return mkdtempSync(join(tmpdir(), 'wildshard-audio-')); }
}

/** Encode one source with ffmpeg in a private work folder; the output must pass AU5's index, format and bitrate. */
async function encode(encoder: AudioEncoder, root: string, url: string, bytes: Uint8Array, role: Role, stereo: boolean): Promise<Uint8Array> {
  const work = workFolder(root), ext = SOURCE.exec(url)?.groups?.['ext'] ?? 'bin';
  try {
    const input = resolve(work, `in.${ext}`), output = resolve(work, 'out.m4a');
    writeFileSync(input, bytes);
    const probed = Number((await run(encoder.ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', input])).trim());
    if (!Number.isInteger(probed) || probed < 1) throw new Error(`${url}: no audio stream to encode`);
    const channels = probed === 1 || (role === 'sfx' && !stereo) ? 1 : 2;
    const kbps = AUDIO_RULES.kbps[role][channels === 1 ? 'mono' : 'stereo'];
    // AudioToolbox's CBR raises stereo under 64 kbps to 64 kbps, past a stereo sound effect's cap: ffmpeg's `aac` takes those.
    const codec = encoder.codec === 'aac_at' && (channels === 1 || kbps >= AAC_AT_STEREO_FLOOR) ? 'aac_at' : 'aac';
    const mode = codec === 'aac_at' ? ['-aac_at_mode', 'cbr', '-aac_at_quality', '0'] : [];
    // A clip of a few frames overshoots its rate (priming and the last frame weigh more): step down 8 kbps, twice at most.
    let missed = '';
    for (const rate of [kbps, kbps - RATE_STEP, kbps - 2 * RATE_STEP]) {
      await run(encoder.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', input, '-map', '0:a:0', '-map_metadata', '-1',
        '-map_chapters', '-1', '-vn', '-c:a', codec, ...mode, '-b:a', `${rate}k`, '-ac', String(channels), '-ar', String(AUDIO_RULES.sampleRate),
        '-fflags', '+bitexact', '-flags:a', '+bitexact', '-f', 'mp4', output]);
      const encoded = new Uint8Array(readFileSync(output)), row = measureRecording(url.replace(/\.[a-z0-9]+$/u, '.m4a'), sha(encoded), encoded);
      if (row.codec !== 'aac' || row.reason !== undefined) throw new Error(`${url}: ${codec} wrote AAC the playback index refuses (${row.reason ?? row.codec})`);
      const findings = missedTargets(row);
      if (findings.length === 0) return encoded;
      missed = findings.map(finding => finding.message).join('; ');
      if (findings.some(finding => finding.rule !== 'bitrate')) break;
    }
    throw new Error(`${url}: ${codec} missed AU5's target: ${missed}`);
  } finally { rmSync(work, { recursive: true, force: true }); }
}

/** The encode steps' own code: a change to its arguments or rate ladder is a new cache key without a schema bump. */
const IMPLEMENTATION = sha(`${encode.toString()}\0${missedTargets.toString()}`);

/** Re-encode a shard's source recordings among its mounts, each at its own URL; every other mount passes through untouched. */
export async function encodeMountAudio(mounts: readonly Mount[], options: AudioEncodeOptions = {}): Promise<{ readonly mounts: Mount[]; readonly stats: AudioEncodeStats; readonly encoder: AudioEncoder | null }> {
  const sources = mounts.filter(mount => isSourceRecordingUrl(mount.url));
  const stats = { files: sources.length, encoded: 0, cached: 0, kept: 0, unencoded: 0, before: 0, after: 0 };
  if (sources.length === 0) return { mounts: [...mounts], stats, encoder: null };
  const encoder = options.encoder === undefined ? await findAudioEncoder() : options.encoder;
  const root = options.cacheRoot ?? process.env['WILDSHARD_AUDIO_CACHE'] ?? resolve(homedir(), '.cache/wildshard/gen/audio-encode/1');
  if (encoder !== null) try { mkdirSync(root, { recursive: true }); } catch { /* The cache is optional; encode still runs. */ }
  const out = new Map<string, Uint8Array>();
  const one = async ({ url, bytes }: Mount): Promise<void> => {
    if (bytes.byteLength > MAX_BYTES) throw new Error(`audio: ${url} is over ${MAX_BYTES / MB} MB`);
    const role: Role = SOURCE.exec(url)?.groups?.['role'] === 'music' ? 'music' : 'sfx', stereo = options.stereo?.has(url) === true;
    stats.before += bytes.byteLength;
    let result: Uint8Array;
    if (url.endsWith('.m4a') && alreadyAtTarget(url, bytes, role, stereo)) { result = bytes; stats.kept++; }
    else if (encoder === null) { result = bytes; stats.unencoded++; }
    else {
      const key = sha(JSON.stringify({ schema: SCHEMA, encoder: encoder.identity, rules: AUDIO_RULES, code: IMPLEMENTATION, role, stereo, source: sha(bytes) }));
      const hit = readCache(root, key);
      if (hit === undefined) { result = await encode(encoder, root, url, bytes, role, stereo); writeCache(root, key, result); stats.encoded++; }
      else { result = hit; stats.cached++; }
    }
    stats.after += result.byteLength;
    out.set(url, result);
  };
  // One failure stops the other workers taking new files.
  const queue = [...sources], workers = Math.max(1, Math.min(4, availableParallelism()));
  await Promise.all(Array.from({ length: workers }, async () => {
    try { for (let next = queue.shift(); next !== undefined; next = queue.shift()) await one(next); }
    catch (error) { queue.length = 0; throw error; }
  }));
  return { mounts: mounts.map(mount => { const bytes = out.get(mount.url); return bytes === undefined ? mount : { url: mount.url, bytes }; }), stats, encoder };
}

/** The build's audio line: before and after MB, and what each recording took. */
export function audioEncodeLine(slug: string, stats: AudioEncodeStats, encoder: AudioEncoder | null): string {
  const mb = (bytes: number): string => `${(bytes / MB).toFixed(2)} MB`;
  const how = [`${stats.encoded} encoded`, `${stats.cached} from cache`, `${stats.kept} already at target`, ...stats.unencoded > 0 ? [`${stats.unencoded} not encoded: no ffmpeg on PATH`] : []];
  return `audio: ${slug} ${stats.files} recordings, ${mb(stats.before)} before, ${mb(stats.after)} after (${how.join(', ')}${encoder === null ? '' : `; ${encoder.codec}`})`;
}
