// The score (src/client/game/audio/theme.ts) → a standard MIDI file, one track per layer, for a composer to take further.
//   node scripts/music/export-midi.mjs [theme|trailer30|trailer15] [out.mid]      default: theme → scripts/music/wildshard-theme.mid
// drone and pad are derived from the chord track (root D2 + D3 held; the pad's four voices per chord); pulse is a GM drum
// track on channel 10 (36 kick · 35 four-on-the-floor kick · 38 tap · 42 shaker). Tempo changes per segment; the theme's
// loop (D → B) is written once, followed by the ring-out.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARRANGEMENTS, CHORDS } from '@wildshard/engine/game/audio/theme';

const here = import.meta.dirname;
const name = process.argv[2] ?? 'theme';
const out = resolve(process.argv[3] ?? `${here}/wildshard-${name}.mid`);

// The defining score is pure author data; Node 24 strips its type-only declarations.
const arr = Object.entries(ARRANGEMENTS).find(([key]) => key === name)?.[1];
if (!arr) throw new Error(`no arrangement ${name}`);

const PPQ = 480;
const LAYERS = ['drone', 'pad', 'pluck', 'marimba', 'bass', 'pulse', 'bell'];
const PROGRAM = { drone: 89, pad: 88, pluck: 24, marimba: 12, bass: 38, bell: 14 }; // GM: pad 2 (warm), new age, nylon guitar, marimba, synth bass 1, tubular bells
const CHANNEL = { drone: 0, pad: 1, pluck: 2, marimba: 3, bass: 4, pulse: 9, bell: 5 };

// events per track: { tick, bytes }
const tracks = Object.fromEntries(LAYERS.map((l) => [l, []]));
const tempoTrack = [];
const vlq = (n) => { let v = n; const b = [v & 0x7f]; while ((v >>= 7) > 0) b.unshift((v & 0x7f) | 0x80); return b; };
const note = (layer, tick, dur, n, v = 0.8) => {
  const ch = CHANNEL[layer], vel = Math.max(1, Math.min(127, Math.round(v * 110)));
  tracks[layer].push({ tick, bytes: [0x90 | ch, n, vel] }, { tick: tick + Math.max(1, Math.round(dur)), bytes: [0x80 | ch, n, 0] });
};

let tick = 0;
const segs = arr.tailFrom !== undefined ? arr.segments : arr.segments; // the loop is written once
for (const seg of segs) {
  const usPerBeat = Math.round(60e6 / seg.bpm);
  tempoTrack.push({ tick, bytes: [0xff, 0x51, 0x03, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff] });
  const T = (b) => tick + Math.round(b * PPQ);
  const segTicks = Math.round(seg.beats * PPQ);
  // chords → pad (held to the next chord) and drone (root pedal for the segment)
  seg.chords.forEach((c, i) => {
    const end = i + 1 < seg.chords.length ? seg.chords[i + 1].t : seg.beats;
    for (const p of CHORDS[c.chord]) note('pad', T(c.t), (end - c.t) * PPQ, p, 0.6);
  });
  if (seg.chords.length > 0 || seg.beats > 0) { note('drone', tick, segTicks, 38, 0.5); note('drone', tick, segTicks, 50, 0.4); }
  for (const layer of ['pluck', 'marimba', 'bass', 'pulse', 'bell']) for (const n of seg.notes[layer] ?? []) note(layer, T(n.t), n.d * PPQ, n.n, n.v ?? 0.8);
  tick += segTicks;
}

const str = (s) => [...Buffer.from(s, 'utf8')];
const meta = (type, data) => [0xff, type, ...vlq(data.length), ...data];
const chunk = (id, body) => [...str(id), (body.length >>> 24) & 0xff, (body.length >>> 16) & 0xff, (body.length >>> 8) & 0xff, body.length & 0xff, ...body];
const trackBytes = (events, head = []) => {
  events.sort((a, b) => a.tick - b.tick || (a.bytes[0] & 0xf0) - (b.bytes[0] & 0xf0)); // note-offs before note-ons at the same tick
  const body = [...head]; let last = 0;
  for (const e of events) { body.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  body.push(0x00, 0xff, 0x2f, 0x00);
  return chunk('MTrk', body);
};
const file = [...chunk('MThd', [0, 1, 0, LAYERS.length + 1, (PPQ >> 8) & 0xff, PPQ & 0xff])];
file.push(...trackBytes(tempoTrack, [0x00, ...meta(0x03, str(`Wildshard — ${arr.name}`)), 0x00, ...meta(0x58, [4, 2, 24, 8])]));
for (const l of LAYERS) {
  const head = [0x00, ...meta(0x03, str(l))];
  if (PROGRAM[l] !== undefined) head.push(0x00, 0xc0 | CHANNEL[l], PROGRAM[l]);
  file.push(...trackBytes(tracks[l], head));
}
writeFileSync(out, Buffer.from(file));
const notes = Object.values(tracks).reduce((a, t) => a + t.length / 2, 0);
console.log(`${arr.name}: ${segs.length} segments, ${notes} notes, ${(tick / PPQ).toFixed(0)} beats → ${out} (${file.length} bytes)`);
