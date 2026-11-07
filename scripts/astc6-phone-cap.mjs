#!/usr/bin/env node
// S4 (SHARD-SIZE-PLAN, E450 B1): Pine's phone building and cabin prop sets at 512. A KTX2 holds its whole mip chain, so a
// 512 set is the 1024 file less its top level: the same blocks, no re-encode. Only an actual smaller file saves download
// bytes; `maxSize` at load only skips a mip that was already fetched.
//
// What: each row of src/shards/pine-hollow/data/astc6.generated.json under a set in data/astc6Cap.json, wider than `max`,
// and no #layer twin (a texture array keeps its layers' size); a GLB's embedded 6×6 images likewise. The table is
// repointed, each .gltf that names a capped file is rewritten, and the 1024 file goes. Idempotent; scripts/bake-astc6.mjs
// runs it after a full bake.
//
//   node scripts/astc6-phone-cap.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const HEADER = 48, INDEX = 32, LEVEL = 24;

/** A KTX2 without its top mip: every level below keeps its bytes, and the header says the file is half the size.
 * @param {Uint8Array} input @returns {Uint8Array} */
export function dropTopMip(input) {
  const source = Buffer.from(input), levels = source.readUInt32LE(40), scheme = source.readUInt32LE(44);
  if (source.toString('latin1', 1, 7) !== 'KTX 20' || levels < 2 || scheme === 1) throw new Error('A top mip drop needs a KTX2 with a mip chain and per-level data');
  const dfdAt = source.readUInt32LE(48), dfdBytes = source.readUInt32LE(52), kvdAt = source.readUInt32LE(56), kvdBytes = source.readUInt32LE(60);
  const sgdAt = Number(source.readBigUInt64LE(64)), sgdBytes = Number(source.readBigUInt64LE(72));
  const rows = Array.from({ length: levels }, (_, level) => { const at = HEADER + INDEX + level * LEVEL;
    return { level, offset: Number(source.readBigUInt64LE(at)), bytes: Number(source.readBigUInt64LE(at + 8)), raw: source.readBigUInt64LE(at + 16) }; });
  const kept = rows.slice(1), pad = (at, to) => (to - at % to) % to, tableEnd = HEADER + INDEX + kept.length * LEVEL, pieces = [];
  let at = tableEnd;
  const put = (bytes, align = 1) => { const fill = pad(at, align); if (fill > 0) { pieces.push(Buffer.alloc(fill)); at += fill; } const start = at; pieces.push(bytes); at += bytes.length; return start; };
  const dfd = put(source.subarray(dfdAt, dfdAt + dfdBytes), 4), kvd = kvdBytes === 0 ? 0 : put(source.subarray(kvdAt, kvdAt + kvdBytes), 4), sgd = sgdBytes === 0 ? 0 : put(source.subarray(sgdAt, sgdAt + sgdBytes), 8);
  // A level's alignment: none under supercompression, a block otherwise. Levels stay in the file's order, smallest first.
  for (const row of [...kept].sort((left, right) => left.offset - right.offset)) row.placed = put(source.subarray(row.offset, row.offset + row.bytes), scheme === 0 ? 16 : 1);
  const head = Buffer.alloc(tableEnd);
  source.copy(head, 0, 0, HEADER);
  head.writeUInt32LE(Math.max(1, source.readUInt32LE(20) >> 1), 20); head.writeUInt32LE(source.readUInt32LE(24) >> 1, 24); head.writeUInt32LE(levels - 1, 40);
  head.writeUInt32LE(dfd, 48); head.writeUInt32LE(dfdBytes, 52); head.writeUInt32LE(kvd, 56); head.writeUInt32LE(kvdBytes, 60);
  head.writeBigUInt64LE(BigInt(sgd), 64); head.writeBigUInt64LE(BigInt(sgdBytes), 72);
  kept.forEach((row, index) => { const entry = HEADER + INDEX + index * LEVEL;
    head.writeBigUInt64LE(BigInt(row.placed), entry); head.writeBigUInt64LE(BigInt(row.bytes), entry + 8); head.writeBigUInt64LE(row.raw, entry + 16); });
  return Buffer.concat([head, ...pieces]);
}

// GLB parts: what bake-ktx2.mjs and bake-astc6.mjs read and write.
export function readGlb(path) {
  const b = Buffer.isBuffer(path) ? path : readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  return { json, bin: b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLen)) };
}
export const imageBytes = (json, bin, view) => { const v = json.bufferViews[view]; return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); };
export function glbBytes(json, bin, swap) {
  const ranges = [];
  for (const [i, v] of json.bufferViews.entries()) {
    if ((v.buffer ?? 0) === 0) ranges.push({ holder: v, off: v.byteOffset ?? 0, len: v.byteLength, data: swap.get(i) });
    const m = v.extensions?.EXT_meshopt_compression;
    if (m && (m.buffer ?? 0) === 0) ranges.push({ holder: m, off: m.byteOffset ?? 0, len: m.byteLength, data: undefined });
  }
  ranges.sort((a, b) => a.off - b.off);
  const parts = []; const placed = new Map(); let at = 0;
  for (const r of ranges) {
    const key = `${r.off}:${r.len}`;
    let where = placed.get(key);
    if (where === undefined || r.data !== undefined) {
      const bytes = r.data ?? bin.subarray(r.off, r.off + r.len);
      const pad = (4 - (at % 4)) % 4; if (pad > 0) { parts.push(Buffer.alloc(pad)); at += pad; }
      where = at; parts.push(bytes); at += bytes.length;
      if (r.data === undefined) placed.set(key, where);
    }
    r.holder.byteOffset = where;
    r.holder.byteLength = r.data?.length ?? r.len;
  }
  const pad = (4 - (at % 4)) % 4; if (pad > 0) { parts.push(Buffer.alloc(pad)); at += pad; }
  json.buffers[0].byteLength = at;
  const out = Buffer.concat(parts);
  let jb = Buffer.from(JSON.stringify(json), 'utf8');
  jb = Buffer.concat([jb, Buffer.alloc((4 - (jb.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jb.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(out.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  header.writeUInt32LE(12 + 8 + jb.length + 8 + out.length, 8);
  return Buffer.concat([header, jh, jb, bh, out]);
}

/** A GLB with each embedded 6×6 image at `max`. An ETC1S plane keeps its size: its levels share one global codebook.
 * @param {Buffer} input @param {number} max the new bytes, or null if no image changed */
export function capGlbImages(input, max) {
  const { json, bin } = readGlb(input), swap = new Map();
  for (const image of json.images ?? []) {
    if (image.bufferView === undefined) continue;
    let bytes = Buffer.from(imageBytes(json, bin, image.bufferView));
    if (bytes.toString('latin1', 1, 7) !== 'KTX 20' || bytes.readUInt32LE(44) === 1) continue;
    while (bytes.readUInt32LE(20) > max) bytes = Buffer.from(dropTopMip(bytes));
    if (bytes.length !== json.bufferViews[image.bufferView].byteLength) swap.set(image.bufferView, bytes);
  }
  return swap.size === 0 ? null : glbBytes(json, bin, swap);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..'), pub = url => join(root, 'public', url), tableFile = join(root, 'src/shards/pine-hollow/data/astc6.generated.json');
  const { max, sets } = JSON.parse(readFileSync(join(root, 'src/shards/pine-hollow/data/astc6Cap.json'), 'utf8'));
  const table = JSON.parse(readFileSync(tableFile, 'utf8')), moved = new Map();
  const named = (url, bytes, ext) => posix.join(posix.dirname(url), `${basename(url).replace(/-[0-9a-f]{8}\.[a-z0-9]+$/u, '')}-${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}.${ext}`);
  const write = (url, bytes) => { mkdirSync(dirname(pub(url)), { recursive: true }); writeFileSync(pub(url), bytes); };
  for (const [served, url] of Object.entries(table)) {
    if (served.endsWith('#layer') || !sets.some(set => served.startsWith(set))) continue;
    if (url.endsWith('.glb')) {
      const bytes = capGlbImages(readFileSync(pub(url)), max);
      if (bytes !== null) { const next = named(url, bytes, 'glb'); write(next, bytes); table[served] = next; moved.set(url, next); }
      continue;
    }
    if (!url.endsWith('.ktx2')) continue;
    let bytes = readFileSync(pub(url)), changed = false;
    while (bytes.readUInt32LE(20) > max) { bytes = dropTopMip(bytes); changed = true; }
    if (!changed) continue;
    const next = named(url, bytes, 'ktx2');
    write(next, bytes); table[served] = next; moved.set(url, next);
  }
  // A .gltf names its textures relative to its own source folder, as bake-astc6.mjs writes them.
  for (const [served, url] of Object.entries(table)) {
    if (!url.endsWith('.gltf')) continue;
    const doc = JSON.parse(readFileSync(pub(url), 'utf8')), folder = posix.dirname(served); let changed = false;
    for (const image of doc.images ?? []) {
      const next = moved.get(posix.join(folder, decodeURI(image.uri)));
      if (next !== undefined) { image.uri = posix.relative(folder, next); changed = true; }
    }
    if (!changed) continue;
    const bytes = Buffer.from(JSON.stringify(doc)), next = named(url, bytes, 'gltf');
    write(next, bytes); table[served] = next; moved.set(url, next);
  }
  for (const url of moved.keys()) rmSync(pub(url));
  writeFileSync(tableFile, `${JSON.stringify(table, null, 2)}\n`);
  console.log(`astc6-phone-cap: ${moved.size} files moved`);
  console.log(JSON.stringify(Object.fromEntries(moved)));
}
