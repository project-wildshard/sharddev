// oxlint-disable oxc/bad-bitwise-operator, eslint/no-loss-of-precision, unicorn/prefer-ternary, eslint/operator-assignment, oxc/branches-sharing-code -- a line-for-line port of fdlibm C: its bit tricks, literals and statement shapes are the source's own, so the two can be read side by side
// QA-FEEDBACK-2026-11-23-b row 14 (meta): a shard built to different bytes on x86 than on arm64. V8's Math.sin, cos,
// tan, asin, acos, atan, atan2, sinh, cosh, tanh, asinh, acosh, atanh, exp, expm1, log, log1p, log2 and log10 call
// fdlibm compiled C (src/base/ieee754.cc). On arm64 the compiler fuses a*b+c into one rounding (FMA); on x86-64 it
// cannot, so the same call returns a different last bit on each (Brasscap: one normal's y was 0 on x86 and 1.4e-18 on
// arm64, one props tile GLB differed, product 378d0e0e vs c08447e1). JavaScript arithmetic is exact IEEE per operation
// on every CPU, so this file is that fdlibm source (V8 13.6, the Node 24 engine) ported line for line to JavaScript:
// on x86-64 it returns exactly what Math does (deterministicMath.test.ts checks that where it runs on x64), and on
// every CPU the same bits. `installDeterministicMath` puts it on the global Math for a build, author code included.
// sqrt, cbrt, pow and hypot already agree on both CPUs (hardware sqrt, or code with no fusable product) and stay.
//
// Ported from V8 src/base/ieee754.cc, which carries this notice:
// ====================================================
// Copyright (C) 1993-2004 by Sun Microsystems, Inc. All rights reserved.
//
// Permission to use, copy, modify, and distribute this
// software is freely granted, provided that this notice
// is preserved.
// ====================================================

const F = new Float64Array(1);
const W = new Int32Array(F.buffer);
if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) throw new Error('deterministicMath needs a little-endian host');
const HI = 1, LO = 0;

/** GET_HIGH_WORD: the signed top 32 bits. */
function high(x: number): number { F[0] = x; return W[HI] ?? 0; }
/** GET_LOW_WORD: the low 32 bits, unsigned. */
function low(x: number): number { F[0] = x; return (W[LO] ?? 0) >>> 0; }
/** INSERT_WORDS. */
function words(hi: number, lo: number): number { W[HI] = hi; W[LO] = lo; return F[0] ?? 0; }
/** SET_LOW_WORD. */
function setLow(x: number, lo: number): number { F[0] = x; W[LO] = lo; return F[0] ?? 0; }
/** SET_HIGH_WORD. */
function setHigh(x: number, hi: number): number { F[0] = x; W[HI] = hi; return F[0] ?? 0; }
/** scalbn for the exponents k_rem_pio2 asks for (|n| < 1023): an exact power-of-two scale. */
function scalbn(x: number, n: number): number { return x * words((0x3ff + n) << 20, 0); }

const TWO_OVER_PI = [
  0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163, 0xABDEBB, 0xC561B7,
  0x246E3A, 0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C,
  0x7026B4, 0x5F7E41, 0x3991D6, 0x398353, 0x39F49C, 0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11,
  0x8B5A0A, 0x6D1F6D, 0x367ECF, 0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7,
  0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08, 0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E,
  0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880, 0x4D7327, 0x310606, 0x1556CA, 0x73A8C9, 0x60E27B, 0xC08C6B,
] as const;
const NPIO2_HW = [
  0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A,
  0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A,
  0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
  0x404858EB, 0x404921FB,
] as const;
const PIO2 = [
  1.57079625129699707031e+00, 7.54978941586159635335e-08, 5.39030252995776476554e-15, 3.28200341580791294123e-22,
  1.27065575308067607349e-29, 1.22933308981111328932e-36, 2.73370053816464559624e-44, 2.16741683877804819444e-51,
] as const;
const TWO24 = 1.67772160000000000000e+07, TWON24 = 5.96046447753906250000e-08;

/** __kernel_rem_pio2 for prec 2 (the only precision rem_pio2 asks for). */
function kernelRemPio2(x: readonly number[], y: number[], e0: number, nx: number): number {
  const jk = 4, jp = jk, jx = nx - 1;
  const iq: number[] = [], f: number[] = [], fq: number[] = [], q: number[] = [];
  let jv = Math.trunc((e0 - 3) / 24);
  if (jv < 0) jv = 0;
  let q0 = e0 - 24 * (jv + 1);
  let j = jv - jx;
  const m = jx + jk;
  for (let i = 0; i <= m; i++, j++) f[i] = j < 0 ? 0 : TWO_OVER_PI[j] ?? 0;
  for (let i = 0; i <= jk; i++) {
    let fw = 0;
    for (j = 0; j <= jx; j++) fw += (x[j] ?? 0) * (f[jx + i - j] ?? 0);
    q[i] = fw;
  }
  let jz = jk, z = 0, n = 0, ih = 0;
  for (;;) {
    let i = 0;
    for (j = jz, z = q[jz] ?? 0; j > 0; i++, j--) {
      const fw = (TWON24 * z) | 0;
      iq[i] = (z - TWO24 * fw) | 0;
      z = (q[j - 1] ?? 0) + fw;
    }
    z = scalbn(z, q0);
    z -= 8.0 * Math.floor(z * 0.125);
    n = z | 0;
    z -= n;
    ih = 0;
    if (q0 > 0) {
      i = (iq[jz - 1] ?? 0) >> (24 - q0);
      n += i;
      iq[jz - 1] = (iq[jz - 1] ?? 0) - (i << (24 - q0));
      ih = (iq[jz - 1] ?? 0) >> (23 - q0);
    } else if (q0 === 0) {
      ih = (iq[jz - 1] ?? 0) >> 23;
    } else if (z >= 0.5) {
      ih = 2;
    }
    if (ih > 0) {
      n += 1;
      let carry = 0;
      for (i = 0; i < jz; i++) {
        j = iq[i] ?? 0;
        if (carry === 0) {
          if (j !== 0) { carry = 1; iq[i] = 0x1000000 - j; }
        } else {
          iq[i] = 0xFFFFFF - j;
        }
      }
      if (q0 === 1) iq[jz - 1] = (iq[jz - 1] ?? 0) & 0x7FFFFF;
      else if (q0 === 2) iq[jz - 1] = (iq[jz - 1] ?? 0) & 0x3FFFFF;
      if (ih === 2) {
        z = 1 - z;
        if (carry !== 0) z -= scalbn(1, q0);
      }
    }
    if (z === 0) {
      j = 0;
      for (i = jz - 1; i >= jk; i--) j |= iq[i] ?? 0;
      if (j === 0) {
        let k = 1;
        while (jk >= k && iq[jk - k] === 0) k++;
        for (i = jz + 1; i <= jz + k; i++) {
          f[jx + i] = TWO_OVER_PI[jv + i] ?? 0;
          let fw = 0;
          for (j = 0; j <= jx; j++) fw += (x[j] ?? 0) * (f[jx + i - j] ?? 0);
          q[i] = fw;
        }
        jz += k;
        continue;
      }
    }
    break;
  }
  if (z === 0) {
    jz -= 1;
    q0 -= 24;
    while (iq[jz] === 0) { jz--; q0 -= 24; }
  } else {
    z = scalbn(z, -q0);
    if (z >= TWO24) {
      const fw = (TWON24 * z) | 0;
      iq[jz] = (z - TWO24 * fw) | 0;
      jz += 1;
      q0 += 24;
      iq[jz] = fw;
    } else {
      iq[jz] = z | 0;
    }
  }
  let fw = scalbn(1, q0);
  for (let i = jz; i >= 0; i--) { q[i] = fw * (iq[i] ?? 0); fw *= TWON24; }
  for (let i = jz; i >= 0; i--) {
    fw = 0;
    for (let k = 0; k <= jp && k <= jz - i; k++) fw += (PIO2[k] ?? 0) * (q[i + k] ?? 0);
    fq[jz - i] = fw;
  }
  fw = 0;
  for (let i = jz; i >= 0; i--) fw += fq[i] ?? 0;
  y[0] = ih === 0 ? fw : -fw;
  fw = (fq[0] ?? 0) - fw;
  for (let i = 1; i <= jz; i++) fw += fq[i] ?? 0;
  y[1] = ih === 0 ? fw : -fw;
  return n & 7;
}

const INVPIO2 = 6.36619772367581382433e-01, PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11,
  PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21, PIO2_3 = 2.02226624871116645580e-21,
  PIO2_3T = 8.47842766036889956997e-32;

/** __ieee754_rem_pio2: x - n*pi/2 as y[0] + y[1]; returns n. */
function remPio2(x: number, y: number[]): number {
  const hx = high(x), ix = hx & 0x7FFFFFFF;
  if (ix <= 0x3FE921FB) { y[0] = x; y[1] = 0; return 0; }
  if (ix < 0x4002D97C) {
    if (hx > 0) {
      let z = x - PIO2_1;
      if (ix !== 0x3FF921FB) { y[0] = z - PIO2_1T; y[1] = (z - y[0]) - PIO2_1T; }
      else { z -= PIO2_2; y[0] = z - PIO2_2T; y[1] = (z - y[0]) - PIO2_2T; }
      return 1;
    }
    let z = x + PIO2_1;
    if (ix !== 0x3FF921FB) { y[0] = z + PIO2_1T; y[1] = (z - y[0]) + PIO2_1T; }
    else { z += PIO2_2; y[0] = z + PIO2_2T; y[1] = (z - y[0]) + PIO2_2T; }
    return -1;
  }
  if (ix <= 0x413921FB) {
    let t = Math.abs(x);
    const n = (t * INVPIO2 + 0.5) | 0, fn = n;
    let r = t - fn * PIO2_1, w = fn * PIO2_1T;
    if (n < 32 && ix !== NPIO2_HW[n - 1]) {
      y[0] = r - w;
    } else {
      const j = ix >> 20;
      y[0] = r - w;
      let i = j - ((high(y[0]) >> 20) & 0x7FF);
      if (i > 16) {
        t = r;
        w = fn * PIO2_2;
        r = t - w;
        w = fn * PIO2_2T - ((t - r) - w);
        y[0] = r - w;
        i = j - ((high(y[0]) >> 20) & 0x7FF);
        if (i > 49) {
          t = r;
          w = fn * PIO2_3;
          r = t - w;
          w = fn * PIO2_3T - ((t - r) - w);
          y[0] = r - w;
        }
      }
    }
    y[1] = (r - y[0]) - w;
    if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
    return n;
  }
  if (ix >= 0x7FF00000) { y[0] = y[1] = x - x; return 0; }
  const e0 = (ix >> 20) - 1046;
  let z = words(ix - (e0 << 20), low(x));
  const tx = [0, 0, 0];
  for (let i = 0; i < 2; i++) { tx[i] = z | 0; z = (z - (tx[i] ?? 0)) * TWO24; }
  tx[2] = z;
  let nx = 3;
  while (tx[nx - 1] === 0) nx--;
  const n = kernelRemPio2(tx, y, e0, nx);
  if (hx < 0) { y[0] = -(y[0] ?? 0); y[1] = -(y[1] ?? 0); return -n; }
  return n;
}

const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
function kernelCos(x: number, y: number): number {
  const ix = high(x) & 0x7FFFFFFF;
  if (ix < 0x3E400000 && (x | 0) === 0) return 1;
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3FD33333) return 1 - (0.5 * z - (z * r - x * y));
  const qx = ix > 0x3FE90000 ? 0.28125 : words(ix - 0x00200000, 0);
  const iz = 0.5 * z - qx, a = 1 - qx;
  return a - (iz - (z * r - x * y));
}

const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
function kernelSin(x: number, y: number, iy: number): number {
  const ix = high(x) & 0x7FFFFFFF;
  if (ix < 0x3E400000 && (x | 0) === 0) return x;
  const z = x * x, v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

const T = [
  3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02, 2.18694882948595424599e-02,
  8.86323982359930005737e-03, 3.59207910759131235356e-03, 1.45620945432529025516e-03, 5.88041240820264096874e-04,
  2.46463134818469906812e-04, 7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
  2.59073051863633712884e-05,
] as const;
const T0 = T[0], T1 = T[1], T2 = T[2], T3 = T[3], T4 = T[4], T5 = T[5], T6 = T[6], T7 = T[7], T8 = T[8], T9 = T[9],
  T10 = T[10], T11 = T[11], T12 = T[12];
const PIO4 = 7.85398163397448278999e-01, PIO4LO = 3.06161699786838301793e-17;
function kernelTan(xIn: number, yIn: number, iy: number): number {
  let x = xIn, y = yIn, z: number, r: number, v: number, w: number, s: number;
  const hx = high(x), ix = hx & 0x7FFFFFFF;
  if (ix < 0x3E300000 && (x | 0) === 0) {
    if (((ix | low(x)) | (iy + 1)) === 0) return 1 / Math.abs(x);
    if (iy === 1) return x;
    w = x + y;
    z = setLow(w, 0);
    v = y - (z - x);
    const a = -1 / w;
    const t = setLow(a, 0);
    s = 1 + t * z;
    return t + a * (s + t * v);
  }
  if (ix >= 0x3FE59428) {
    if (hx < 0) { x = -x; y = -y; }
    z = PIO4 - x;
    w = PIO4LO - y;
    x = z + w;
    y = 0.0;
  }
  z = x * x;
  w = z * z;
  r = T1 + w * (T3 + w * (T5 + w * (T7 + w * (T9 + w * T11))));
  v = z * (T2 + w * (T4 + w * (T6 + w * (T8 + w * (T10 + w * T12)))));
  s = z * x;
  r = y + z * (s * (r + v) + y);
  r += T0 * s;
  w = x + r;
  if (ix >= 0x3FE59428) {
    v = iy;
    return (1 - ((hx >> 30) & 2)) * (v - 2.0 * (x - (w * w / (w + v) - r)));
  }
  if (iy === 1) return w;
  z = setLow(w, 0);
  v = r - (z - x);
  const a = -1.0 / w;
  const t = setLow(a, 0);
  s = 1.0 + t * z;
  return t + a * (s + t * v);
}

const reduced = [0, 0];
function sin(x: number): number {
  const ix = high(x) & 0x7FFFFFFF;
  if (ix <= 0x3FE921FB) return kernelSin(x, 0, 0);
  if (ix >= 0x7FF00000) return x - x;
  const n = remPio2(x, reduced), a = reduced[0] ?? 0, b = reduced[1] ?? 0;
  switch (n & 3) {
    case 0: return kernelSin(a, b, 1);
    case 1: return kernelCos(a, b);
    case 2: return -kernelSin(a, b, 1);
    default: return -kernelCos(a, b);
  }
}
function cos(x: number): number {
  const ix = high(x) & 0x7FFFFFFF;
  if (ix <= 0x3FE921FB) return kernelCos(x, 0);
  if (ix >= 0x7FF00000) return x - x;
  const n = remPio2(x, reduced), a = reduced[0] ?? 0, b = reduced[1] ?? 0;
  switch (n & 3) {
    case 0: return kernelCos(a, b);
    case 1: return -kernelSin(a, b, 1);
    case 2: return -kernelCos(a, b);
    default: return kernelSin(a, b, 1);
  }
}
function tan(x: number): number {
  const ix = high(x) & 0x7FFFFFFF;
  if (ix <= 0x3FE921FB) return kernelTan(x, 0, 1);
  if (ix >= 0x7FF00000) return x - x;
  const n = remPio2(x, reduced);
  return kernelTan(reduced[0] ?? 0, reduced[1] ?? 0, 1 - ((n & 1) << 1));
}

const PI = 3.14159265358979311600e+00, PIO2_HI = 1.57079632679489655800e+00, PIO2_LO = 6.12323399573676603587e-17,
  PIO4_HI = 7.85398163397448278999e-01;
const PS0 = 1.66666666666666657415e-01, PS1 = -3.25565818622400915405e-01, PS2 = 2.01212532134862925881e-01,
  PS3 = -4.00555345006794114027e-02, PS4 = 7.91534994289814532176e-04, PS5 = 3.47933107596021167570e-05,
  QS1 = -2.40339491173441421878e+00, QS2 = 2.02094576023350569471e+00, QS3 = -6.88283971605453293030e-01,
  QS4 = 7.70381505559019352791e-02;
function acos(x: number): number {
  const hx = high(x), ix = hx & 0x7FFFFFFF;
  if (ix >= 0x3FF00000) {
    if (((ix - 0x3FF00000) | low(x)) === 0) return hx > 0 ? 0.0 : PI + 2.0 * PIO2_LO;
    return Number.NaN;
  }
  if (ix < 0x3FE00000) {
    if (ix <= 0x3C600000) return PIO2_HI + PIO2_LO;
    const z = x * x;
    const p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
    const q = 1 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
    const r = p / q;
    return PIO2_HI - (x - (PIO2_LO - x * r));
  }
  if (hx < 0) {
    const z = (1 + x) * 0.5;
    const p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
    const q = 1 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
    const s = Math.sqrt(z);
    const r = p / q;
    const w = r * s - PIO2_LO;
    return PI - 2.0 * (s + w);
  }
  const z = (1 - x) * 0.5;
  const s = Math.sqrt(z);
  const df = setLow(s, 0);
  const c = (z - df * df) / (s + df);
  const p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
  const q = 1 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
  const r = p / q;
  const w = r * s + c;
  return 2.0 * (df + w);
}
function asin(x: number): number {
  const hx = high(x), ix = hx & 0x7FFFFFFF;
  let t = 0;
  if (ix >= 0x3FF00000) {
    if (((ix - 0x3FF00000) | low(x)) === 0) return x * PIO2_HI + x * PIO2_LO;
    return Number.NaN;
  } else if (ix < 0x3FE00000) {
    if (ix < 0x3E400000) return x;
    t = x * x;
    const p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
    const q = 1 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
    const w = p / q;
    return x + x * w;
  }
  let w = 1 - Math.abs(x);
  t = w * 0.5;
  let p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
  let q = 1 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
  const s = Math.sqrt(t);
  if (ix >= 0x3FEF3333) {
    w = p / q;
    t = PIO2_HI - (2.0 * (s + s * w) - PIO2_LO);
  } else {
    w = setLow(s, 0);
    const c = (t - w * w) / (s + w);
    const r = p / q;
    p = 2.0 * s * r - (PIO2_LO - 2.0 * c);
    q = PIO4_HI - 2.0 * w;
    t = PIO4_HI - (p - q);
  }
  return hx > 0 ? t : -t;
}

const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01,
  1.57079632679489655800e+00] as const;
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17] as const;
const AT0 = 3.33333333333329318027e-01, AT1 = -1.99999999998764832476e-01, AT2 = 1.42857142725034663711e-01,
  AT3 = -1.11111104054623557880e-01, AT4 = 9.09088713343650656196e-02, AT5 = -7.69187620504482999495e-02,
  AT6 = 6.66107313738753120669e-02, AT7 = -5.83357013379057348645e-02, AT8 = 4.97687799461593236017e-02,
  AT9 = -3.65315727442169155270e-02, AT10 = 1.62858201153657823623e-02;
function atan(xIn: number): number {
  let x = xIn, id: number;
  const hx = high(x), ix = hx & 0x7FFFFFFF;
  if (ix >= 0x44100000) {
    if (ix > 0x7FF00000 || (ix === 0x7FF00000 && low(x) !== 0)) return x + x;
    return hx > 0 ? ATANHI[3] + ATANLO[3] : -ATANHI[3] - ATANLO[3];
  }
  if (ix < 0x3FDC0000) {
    if (ix < 0x3E400000) return x;
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3FF30000) {
      if (ix < 0x3FE60000) { id = 0; x = (2.0 * x - 1) / (2.0 + x); }
      else { id = 1; x = (x - 1) / (x + 1); }
    } else if (ix < 0x40038000) {
      id = 2; x = (x - 1.5) / (1 + 1.5 * x);
    } else {
      id = 3; x = -1.0 / x;
    }
  }
  let z = x * x;
  const w = z * z;
  const s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  if (id < 0) return x - x * (s1 + s2);
  z = (ATANHI[id] ?? 0) - ((x * (s1 + s2) - (ATANLO[id] ?? 0)) - x);
  return hx < 0 ? -z : z;
}
const TINY = 1.0e-300, PI_O_4 = 7.8539816339744827900E-01, PI_O_2 = 1.5707963267948965580E+00,
  PI_LO = 1.2246467991473531772E-16;
function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return x + y;
  if (x === 1) return atan(y);
  const hx = high(x), lx = low(x), ix = hx & 0x7FFFFFFF, hy = high(y), ly = low(y), iy = hy & 0x7FFFFFFF;
  let m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
  if ((iy | ly) === 0) {
    switch (m) {
      case 0: case 1: return y;
      case 2: return PI + TINY;
      default: return -PI - TINY;
    }
  }
  if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
  if (ix === 0x7FF00000) {
    if (iy === 0x7FF00000) {
      switch (m) {
        case 0: return PI_O_4 + TINY;
        case 1: return -PI_O_4 - TINY;
        case 2: return 3.0 * PI_O_4 + TINY;
        default: return -3.0 * PI_O_4 - TINY;
      }
    }
    switch (m) {
      case 0: return 0;
      case 1: return -0;
      case 2: return PI + TINY;
      default: return -PI - TINY;
    }
  }
  if (iy === 0x7FF00000) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
  const k = (iy - ix) >> 20;
  let z: number;
  if (k > 60) { z = PI_O_2 + 0.5 * PI_LO; m &= 1; }
  else if (hx < 0 && k < -60) z = 0.0;
  else z = atan(Math.abs(y / x));
  switch (m) {
    case 0: return z;
    case 1: return -z;
    case 2: return PI - (z - PI_LO);
    default: return (z - PI_LO) - PI;
  }
}

const O_THRESHOLD = 7.09782712893383973096e+02, U_THRESHOLD = -7.45133219101941108420e+02,
  LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INVLN2 = 1.44269504088896338700e+00,
  P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
  P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08, HUGE = 1.0e+300,
  TWOM1000 = 9.33263618503218878990e-302, TWO1023 = 8.988465674311579539e307;
function exp(xIn: number): number {
  let x = xIn, hi = 0, lo = 0, k = 0;
  const hxs = high(x), xsb = (hxs >>> 31) & 1, hx = hxs & 0x7FFFFFFF;
  if (hx >= 0x40862E42) {
    if (hx >= 0x7FF00000) {
      if (((hx & 0xFFFFF) | low(x)) !== 0) return x + x;
      return xsb === 0 ? x : 0.0;
    }
    if (x > O_THRESHOLD) return HUGE * HUGE;
    if (x < U_THRESHOLD) return TWOM1000 * TWOM1000;
  }
  if (hx > 0x3FD62E42) {
    if (hx < 0x3FF0A2B2) {
      if (x === 1.0) return Math.E;
      hi = x - (xsb === 0 ? LN2_HI : -LN2_HI);
      lo = xsb === 0 ? LN2_LO : -LN2_LO;
      k = 1 - xsb - xsb;
    } else {
      k = (INVLN2 * x + (xsb === 0 ? 0.5 : -0.5)) | 0;
      const t = k;
      hi = x - t * LN2_HI;
      lo = t * LN2_LO;
    }
    x = hi - lo;
  } else if (hx < 0x3E300000) {
    return 1 + x;
  } else {
    k = 0;
  }
  const t = x * x;
  const twopk = k >= -1021 ? words((0x3FF00000 + (k << 20)) | 0, 0) : words((0x3FF00000 + ((k + 1000) << 20)) | 0, 0);
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2.0) - x);
  const y = 1 - ((lo - (x * c) / (2.0 - c)) - hi);
  if (k >= -1021) {
    if (k === 1024) return y * 2.0 * TWO1023;
    return y * twopk;
  }
  return y * twopk * TWOM1000;
}

const Q1 = -3.33333333333331316428e-02, Q2 = 1.58730158725481460165e-03, Q3 = -7.93650757867487942473e-05,
  Q4 = 4.00821782732936239552e-06, Q5 = -2.01099218183624371326e-07;
function expm1(xIn: number): number {
  let x = xIn, hi: number, lo: number, c = 0, k: number, t: number, y: number;
  const hxs = high(x), negative = hxs < 0, hx = hxs & 0x7FFFFFFF;
  if (hx >= 0x4043687A) {
    if (hx >= 0x40862E42) {
      if (hx >= 0x7FF00000) {
        if (((hx & 0xFFFFF) | low(x)) !== 0) return x + x;
        return negative ? -1.0 : x;
      }
      if (x > O_THRESHOLD) return HUGE * HUGE;
    }
    if (negative && x + TINY < 0.0) return TINY - 1;
  }
  if (hx > 0x3FD62E42) {
    if (hx < 0x3FF0A2B2) {
      if (!negative) { hi = x - LN2_HI; lo = LN2_LO; k = 1; }
      else { hi = x + LN2_HI; lo = -LN2_LO; k = -1; }
    } else {
      k = (INVLN2 * x + (negative ? -0.5 : 0.5)) | 0;
      t = k;
      hi = x - t * LN2_HI;
      lo = t * LN2_LO;
    }
    x = hi - lo;
    c = (hi - x) - lo;
  } else if (hx < 0x3C900000) {
    t = HUGE + x;
    return x - (t - (HUGE + x));
  } else {
    k = 0;
  }
  const hfx = 0.5 * x, hxs2 = x * hfx;
  const r1 = 1 + hxs2 * (Q1 + hxs2 * (Q2 + hxs2 * (Q3 + hxs2 * (Q4 + hxs2 * Q5))));
  t = 3.0 - r1 * hfx;
  let e = hxs2 * ((r1 - t) / (6.0 - x * t));
  if (k === 0) return x - (x * e - hxs2);
  const twopk = words((0x3FF00000 + (k << 20)) | 0, 0);
  e = (x * (e - c) - c);
  e -= hxs2;
  if (k === -1) return 0.5 * (x - e) - 0.5;
  if (k === 1) {
    if (x < -0.25) return -2.0 * (e - (x + 0.5));
    return 1 + 2.0 * (x - e);
  }
  if (k <= -2 || k > 56) {
    y = 1 - (e - x);
    if (k === 1024) y = y * 2.0 * 8.98846567431158e+307;
    else y = y * twopk;
    return y - 1;
  }
  t = 1;
  if (k < 20) {
    t = setHigh(t, 0x3FF00000 - (0x200000 >> k));
    y = t - (e - x);
    y = y * twopk;
  } else {
    t = setHigh(t, (0x3FF - k) << 20);
    y = x - (e + t);
    y += 1;
    y = y * twopk;
  }
  return y;
}

const TWO54 = 1.80143985094819840000e+16;
const LG1 = 6.666666666666735130e-01, LG2 = 3.999999999940941908e-01, LG3 = 2.857142874366239149e-01,
  LG4 = 2.222219843214978396e-01, LG5 = 1.818357216161805012e-01, LG6 = 1.531383769920937332e-01,
  LG7 = 1.479819860511658591e-01;
function log(xIn: number): number {
  let x = xIn, k = 0, hx = high(x);
  const lx = low(x);
  if (hx < 0x00100000) {
    if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
    if (hx < 0) return Number.NaN;
    k -= 54;
    x *= TWO54;
    hx = high(x);
  }
  if (hx >= 0x7FF00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000FFFFF;
  let i = (hx + 0x95F64) & 0x100000;
  x = setHigh(x, hx | (i ^ 0x3FF00000));
  k += i >> 20;
  const f = x - 1.0;
  if ((0x000FFFFF & (2 + hx)) < 3) {
    if (f === 0) {
      if (k === 0) return 0;
      const dk = k;
      return dk * LN2_HI + dk * LN2_LO;
    }
    const R = f * f * (0.5 - 0.33333333333333333 * f);
    if (k === 0) return f - R;
    const dk = k;
    return dk * LN2_HI - ((R - dk * LN2_LO) - f);
  }
  const s = f / (2.0 + f), dk = k, z = s * s;
  i = hx - 0x6147A;
  const w = z * z, j = 0x6B851 - hx;
  const t1 = w * (LG2 + w * (LG4 + w * LG6)), t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  i |= j;
  const R = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + R));
    return dk * LN2_HI - ((hfsq - (s * (hfsq + R) + dk * LN2_LO)) - f);
  }
  if (k === 0) return f - s * (f - R);
  return dk * LN2_HI - ((s * (f - R) - dk * LN2_LO) - f);
}
function log1p(x: number): number {
  let f = 0, c = 0, hu = 0, k = 1, u: number;
  const hx = high(x), ax = hx & 0x7FFFFFFF;
  if (hx < 0x3FDA827A) {
    if (ax >= 0x3FF00000) return x === -1.0 ? -Infinity : Number.NaN;
    if (ax < 0x3E200000) return ax < 0x3C900000 ? x : x - x * x * 0.5;
    if (hx > 0 || hx <= (0xBFD2BEC4 | 0)) { k = 0; f = x; hu = 1; }
  }
  if (hx >= 0x7FF00000) return x + x;
  if (k !== 0) {
    if (hx < 0x43400000) {
      u = 1.0 + x;
      hu = high(u);
      k = (hu >> 20) - 1023;
      c = k > 0 ? 1.0 - (u - x) : x - (u - 1.0);
      c /= u;
    } else {
      u = x;
      hu = high(u);
      k = (hu >> 20) - 1023;
      c = 0;
    }
    hu &= 0x000FFFFF;
    if (hu < 0x6A09E) {
      u = setHigh(u, hu | 0x3FF00000);
    } else {
      k += 1;
      u = setHigh(u, hu | 0x3FE00000);
      hu = (0x00100000 - hu) >> 2;
    }
    f = u - 1.0;
  }
  const hfsq = 0.5 * f * f;
  if (hu === 0) {
    if (f === 0) {
      if (k === 0) return 0;
      c += k * LN2_LO;
      return k * LN2_HI + c;
    }
    const R = hfsq * (1.0 - 0.66666666666666666 * f);
    if (k === 0) return f - R;
    return k * LN2_HI - ((R - (k * LN2_LO + c)) - f);
  }
  const s = f / (2.0 + f), z = s * s;
  const R = z * (LG1 + z * (LG2 + z * (LG3 + z * (LG4 + z * (LG5 + z * (LG6 + z * LG7))))));
  if (k === 0) return f - (hfsq - s * (hfsq + R));
  return k * LN2_HI - ((hfsq - (s * (hfsq + R) + (k * LN2_LO + c))) - f);
}
function kLog1p(f: number): number {
  const s = f / (2.0 + f), z = s * s, w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6)), t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const R = t2 + t1, hfsq = 0.5 * f * f;
  return s * (hfsq + R);
}
const IVLN2HI = 1.44269504072144627571e+00, IVLN2LO = 1.67517131648865118353e-10;
function log2(xIn: number): number {
  let x = xIn, k = 0, hx = high(x);
  const lx = low(x);
  if (hx < 0x00100000) {
    if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
    if (hx < 0) return Number.NaN;
    k -= 54;
    x *= TWO54;
    hx = high(x);
  }
  if (hx >= 0x7FF00000) return x + x;
  if (hx === 0x3FF00000 && lx === 0) return 0.0;
  k += (hx >> 20) - 1023;
  hx &= 0x000FFFFF;
  const i = (hx + 0x95F64) & 0x100000;
  x = setHigh(x, hx | (i ^ 0x3FF00000));
  k += i >> 20;
  const y = k, f = x - 1.0, hfsq = 0.5 * f * f, r = kLog1p(f);
  const hi = setLow(f - hfsq, 0);
  const lo = (f - hi) - hfsq + r;
  let valHi = hi * IVLN2HI, valLo = (lo + hi) * IVLN2LO + lo * IVLN2HI;
  const w = y + valHi;
  valLo += (y - w) + valHi;
  valHi = w;
  return valLo + valHi;
}
const IVLN10 = 4.34294481903251816668e-01, LOG10_2HI = 3.01029995663611771306e-01,
  LOG10_2LO = 3.69423907715893078616e-13;
function log10(xIn: number): number {
  let x = xIn, k = 0, hx = high(x), lx = low(x);
  if (hx < 0x00100000) {
    if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
    if (hx < 0) return Number.NaN;
    k -= 54;
    x *= TWO54;
    hx = high(x);
    lx = low(x);
  }
  if (hx >= 0x7FF00000) return x + x;
  if (hx === 0x3FF00000 && lx === 0) return 0.0;
  k += (hx >> 20) - 1023;
  const i = k >>> 31;
  hx = (hx & 0x000FFFFF) | ((0x3FF - i) << 20);
  const y = k + i;
  x = words(hx, lx);
  const z = y * LOG10_2LO + IVLN10 * log(x);
  return z + y * LOG10_2HI;
}

const LN2 = 6.93147180559945286227e-01;
function acosh(x: number): number {
  const hx = high(x), lx = low(x);
  if (hx < 0x3FF00000) return Number.NaN;
  if (hx >= 0x41B00000) return hx >= 0x7FF00000 ? x + x : log(x) + LN2;
  if (((hx - 0x3FF00000) | lx) === 0) return 0.0;
  if (hx > 0x40000000) {
    const t = x * x;
    return log(2.0 * x - 1 / (x + Math.sqrt(t - 1)));
  }
  const t = x - 1;
  return log1p(t + Math.sqrt(2.0 * t + t * t));
}
function asinh(x: number): number {
  const hx = high(x), ix = hx & 0x7FFFFFFF;
  let w: number;
  if (ix >= 0x7FF00000) return x + x;
  if (ix < 0x3E300000) return x;
  if (ix > 0x41B00000) {
    w = log(Math.abs(x)) + LN2;
  } else if (ix > 0x40000000) {
    const t = Math.abs(x);
    w = log(2.0 * t + 1 / (Math.sqrt(x * x + 1) + t));
  } else {
    const t = x * x;
    w = log1p(Math.abs(x) + t / (1 + Math.sqrt(1 + t)));
  }
  return hx > 0 ? w : -w;
}
function atanh(xIn: number): number {
  let x = xIn, t: number;
  const hx = high(x), lx = low(x), ix = hx & 0x7FFFFFFF;
  if ((ix | (lx !== 0 ? 1 : 0)) > 0x3FF00000) return Number.NaN;
  if (ix === 0x3FF00000) return x > 0 ? Infinity : -Infinity;
  if (ix < 0x3E300000) return x;
  x = setHigh(x, ix);
  if (ix < 0x3FE00000) {
    t = x + x;
    t = 0.5 * log1p(t + t * x / (1 - x));
  } else {
    t = 0.5 * log1p((x + x) / (1 - x));
  }
  return hx >= 0 ? t : -t;
}

const KCOSH_OVERFLOW = 710.4758600739439;
function cosh(x: number): number {
  const ix = high(x) & 0x7FFFFFFF;
  if (ix < 0x3FD62E43) {
    const t = expm1(Math.abs(x)), w = 1 + t;
    if (ix < 0x3C800000) return w;
    return 1 + (t * t) / (w + w);
  }
  if (ix < 0x40360000) {
    const t = exp(Math.abs(x));
    return 0.5 * t + 0.5 / t;
  }
  if (ix < 0x40862E42) return 0.5 * exp(Math.abs(x));
  if (Math.abs(x) <= KCOSH_OVERFLOW) {
    const w = exp(0.5 * Math.abs(x)), t = 0.5 * w;
    return t * w;
  }
  if (ix >= 0x7FF00000) return x * x;
  return HUGE * HUGE;
}
const TWO_M28 = 3.725290298461914e-9, LOG_MAXD = 709.7822265625, SHUGE = 1.0e307;
function sinh(x: number): number {
  const h = x < 0 ? -0.5 : 0.5, ax = Math.abs(x);
  if (ax < 22) {
    if (ax < TWO_M28) return x;
    const t = expm1(ax);
    if (ax < 1) return h * (2 * t - t * t / (t + 1));
    return h * (t + t / (t + 1));
  }
  if (ax < LOG_MAXD) return h * exp(ax);
  if (ax <= KCOSH_OVERFLOW) {
    const w = exp(0.5 * ax), t = h * w;
    return t * w;
  }
  return x * SHUGE;
}
function tanh(x: number): number {
  const jx = high(x), ix = jx & 0x7FFFFFFF;
  let z: number;
  if (ix >= 0x7FF00000) return jx >= 0 ? 1 / x + 1 : 1 / x - 1;
  if (ix < 0x40360000) {
    if (ix < 0x3E300000) return x;
    if (ix >= 0x3FF00000) {
      const t = expm1(2 * Math.abs(x));
      z = 1 - 2 / (t + 2);
    } else {
      const t = expm1(-2 * Math.abs(x));
      z = -t / (t + 2);
    }
  } else {
    z = 1 - TINY;
  }
  return jx >= 0 ? z : -z;
}

/** Names this implementation in generation cache keys: a step cached under native Math (or an older port) misses. */
export const DETERMINISTIC_MATH = 'v8-13.6-fdlibm-js/1';

/** The same bits on every CPU: V8's fdlibm, without the fused multiply-add arm64 adds. */
type Unary = (x: number) => number;
/** The Math functions this file replaces, by their Math name. */
export interface DeterministicMath {
  readonly acos: Unary; readonly acosh: Unary; readonly asin: Unary; readonly asinh: Unary; readonly atan: Unary;
  readonly atan2: (y: number, x: number) => number; readonly atanh: Unary; readonly cos: Unary; readonly cosh: Unary;
  readonly exp: Unary; readonly expm1: Unary; readonly log: Unary; readonly log10: Unary; readonly log1p: Unary;
  readonly log2: Unary; readonly sin: Unary; readonly sinh: Unary; readonly tan: Unary; readonly tanh: Unary;
}
export const deterministicMath: DeterministicMath = {
  acos, acosh, asin, asinh, atan, atan2, atanh, cos, cosh, exp, expm1, log, log10, log1p, log2, sin, sinh, tan, tanh,
};

let installed = false;
/** Put `deterministicMath` on the global Math for the rest of this process, so a build (its author code, three.js and
 *  the SDK's own bakes) computes the same bits on x86-64 and arm64. Idempotent. */
export function installDeterministicMath(): void {
  if (installed) return;
  for (const [name, fn] of Object.entries(deterministicMath)) {
    Object.defineProperty(Math, name, { value: fn, writable: true, configurable: true, enumerable: false });
  }
  installed = true;
}
