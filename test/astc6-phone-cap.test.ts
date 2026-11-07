import { expect, test } from 'vitest';
import { dropTopMip } from '../scripts/astc6-phone-cap.mjs';
import { otherTierSplatFiles } from '../src/shared/game/shardfile/wholeInputs';

/** A KTX2 with three zstd-marked levels of recognisable bytes: 8×8 down to 2×2, stored smallest first. */
function ktx2(): Buffer {
  const levels = [Buffer.alloc(64, 1), Buffer.alloc(16, 2), Buffer.alloc(4, 3)], dfd = Buffer.alloc(44, 7), kvd = Buffer.alloc(8, 9);
  const table = 80 + levels.length * 24, dfdAt = table, kvdAt = dfdAt + dfd.length, dataAt = kvdAt + kvd.length;
  const head = Buffer.alloc(table);
  head.write('«KTX 20»\r\n\u001A\n', 0, 'latin1');
  head.writeUInt32LE(166, 12); head.writeUInt32LE(1, 16); head.writeUInt32LE(8, 20); head.writeUInt32LE(8, 24);
  head.writeUInt32LE(1, 36); head.writeUInt32LE(levels.length, 40); head.writeUInt32LE(2, 44);
  head.writeUInt32LE(dfdAt, 48); head.writeUInt32LE(dfd.length, 52); head.writeUInt32LE(kvdAt, 56); head.writeUInt32LE(kvd.length, 60);
  let at = dataAt;
  for (const level of [2, 1, 0]) {
    const bytes = levels[level] ?? Buffer.alloc(0), row = 80 + level * 24;
    head.writeBigUInt64LE(BigInt(at), row); head.writeBigUInt64LE(BigInt(bytes.length), row + 8); head.writeBigUInt64LE(BigInt(bytes.length), row + 16);
    at += bytes.length;
  }
  return Buffer.concat([head, dfd, kvd, levels[2] ?? Buffer.alloc(0), levels[1] ?? Buffer.alloc(0), levels[0] ?? Buffer.alloc(0)]);
}

test('a dropped top mip halves the header and keeps every lower level, its data blocks and its metadata', () => {
  const out = Buffer.from(dropTopMip(ktx2()));
  expect(out.readUInt32LE(20)).toBe(4);
  expect(out.readUInt32LE(24)).toBe(4);
  expect(out.readUInt32LE(40)).toBe(2);
  const first = Number(out.readBigUInt64LE(80)), firstBytes = Number(out.readBigUInt64LE(88)), second = Number(out.readBigUInt64LE(104));
  expect(out.subarray(first, first + firstBytes).every(byte => byte === 2)).toBe(true);
  expect(firstBytes).toBe(16);
  expect(out.subarray(second, second + 4).every(byte => byte === 3)).toBe(true);
  expect(out.subarray(out.readUInt32LE(48), out.readUInt32LE(48) + 44).every(byte => byte === 7)).toBe(true);
  expect(out.subarray(out.readUInt32LE(56), out.readUInt32LE(56) + 8).every(byte => byte === 9)).toBe(true);
  expect(out.length).toBe(ktx2().length - 64 - 24);
});

test('an ETC1S file, or one with no chain, is refused: its levels share one codebook', () => {
  const basis = ktx2(); basis.writeUInt32LE(1, 44);
  expect(() => dropTopMip(basis)).toThrow('per-level data');
  const single = ktx2(); single.writeUInt32LE(1, 40);
  expect(() => dropTopMip(single)).toThrow('mip chain');
});

test('each tier leaves out the layers only the other tier draws', () => {
  const hash = (byte: string): string => byte.repeat(64), four = (byte: string): string[] => [hash(byte), hash(byte), hash(byte), hash(byte)];
  const set = (colour: string, normal: string) => ({ colour: four(colour), normal: four(normal), arm: four('e') }), tint = [1, 1, 1];
  const props = { splat: { material: 'ground', layers: set('a', 'b'), phone: set('c', 'd'), tints: [tint, tint, tint, tint], boreal: null } } as unknown as Parameters<typeof otherTierSplatFiles>[0]['props'];
  expect([...otherTierSplatFiles({ props }, 'phone')].sort()).toEqual([hash('a'), hash('b')]);
  expect([...otherTierSplatFiles({ props }, 'desktop')].sort()).toEqual([hash('c'), hash('d')]);
  expect(otherTierSplatFiles({ props: null }, 'phone').size).toBe(0);
});
