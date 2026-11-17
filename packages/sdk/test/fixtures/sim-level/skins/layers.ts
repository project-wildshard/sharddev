import type { Bone, EulerOrder } from 'three';
import type { ClipName } from '../../../../src/client/engine/anim/rig';
import type { SkinSource } from './sources';

/** Numeric pose layers stay separate from the base gait, retaining each authored clock's period. */
export interface PoseLayerTrack { bone: string; property: 'position' | 'rotation' | 'scale' | 'quaternion'; axis: 'x' | 'y' | 'z'; order: EulerOrder; values: number[] }
/** A coupled phase table is needed only where the ranger's breathing changes the walking arm decomposition. */
export interface PoseLayer { id: string; period: number; times: number[]; phaseSteps: number; phasePeriod: number; tracks: PoseLayerTrack[] }
type Axis = 'x' | 'y' | 'z';
interface Field { bone: string; property: 'position' | 'rotation' | 'scale'; axis: Axis }
const field = (bone: string, property: Field['property'], ...axes: Axis[]): Field[] => axes.map((axis) => ({ bone, property, axis }));
const joint = (source: SkinSource, name: string): Bone => { const bone = source.mesh.skeleton.bones.find((b) => b.name === name); if (bone === undefined) throw new Error(`Missing layer joint ${name}`); return bone; };
const value = (source: SkinSource, f: Field): number => joint(source, f.bone)[f.property][f.axis];
function times(period: number, knots: readonly number[] = []): number[] { const frames = Math.ceil(period * 60); return [...new Set([...Array.from({ length: frames + 1 }, (_, i) => i * period / frames), ...knots])].sort((a, b) => a - b); }
function delta(value: number, base: number, rotation: boolean): number { return rotation ? Math.atan2(Math.sin(value - base), Math.cos(value - base)) : value - base; }

/** Sample fields that depend only on this clock, with an optional independently measured contribution removed. */
function capture(source: SkinSource, base: SkinSource, clip: ClipName, id: string, period: number, fields: Field[], subtract?: (f: Field, time: number) => number): PoseLayer {
  base.pose(clip, 0, 0); const refs = fields.map((f) => value(base, f)), tracks = fields.map((f) => ({ ...f, order: joint(base, f.bone).rotation.order, values: [] as number[] })), ticks = times(period);
  for (const t of ticks) { source.pose(clip, t, 0); tracks.forEach((track, i) => { const f = fields[i]; if (f === undefined) throw new Error('Missing field'); track.values.push(delta(value(source, f), refs[i] ?? 0, f.property === 'rotation') - (subtract?.(f, t) ?? 0)); }); }
  // Endpoint identity is proved numerically, never forced to hide a seam.
  for (const track of tracks) if (Math.abs((track.values[0] ?? 0) - (track.values.at(-1) ?? 0)) > 1e-5) throw new Error(`Nonperiodic pose layer ${id}/${track.bone}/${track.axis}`);
  return { id, period, times: ticks, phaseSteps: 0, phasePeriod: 1, tracks: tracks.filter((track) => track.values.some((v) => Math.abs(v) > 1e-7)) };
}

/** Fit linear oscillators/pulses to the actual source's scalar channels, rather than substitute procedural runtime code. */
function fit(samples: readonly { time: number; value: number }[], basis: readonly ((t: number) => number)[]): number[] {
  const n = basis.length, matrix = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  for (const sample of samples) { const values = basis.map((fn) => fn(sample.time)); for (let i = 0; i < n; i++) { const row = matrix[i]; if (row === undefined) throw new Error('Missing fit row'); for (let j = 0; j < n; j++) row[j] = (row[j] ?? 0) + (values[i] ?? 0) * (values[j] ?? 0); row[n] = (row[n] ?? 0) + (values[i] ?? 0) * sample.value; } }
  for (let i = 0; i < n; i++) {
    const pivot = matrix[i]; if (pivot === undefined || Math.abs(pivot[i] ?? 0) < 1e-8) throw new Error('Singular pose fit');
    const divisor = pivot[i] ?? 0; for (let j = i; j <= n; j++) pivot[j] = (pivot[j] ?? 0) / divisor;
    for (let r = 0; r < n; r++) if (r !== i) { const row = matrix[r]; if (row === undefined) throw new Error('Missing pose fit'); const mul = row[i] ?? 0; for (let j = i; j <= n; j++) row[j] = (row[j] ?? 0) - mul * (pivot[j] ?? 0); }
  }
  return matrix.map((row) => row[n] ?? 0);
}
interface Signal { id: string; period: number; basis: readonly ((t: number) => number)[]; knots?: number[] }
const oscillation = (rate: number): Signal => ({ id: `wave-${String(rate).replace('.', '-')}`, period: 2 * Math.PI / rate, basis: [(t) => Math.sin(rate * t), (t) => Math.cos(rate * t) - 1] });
const pulse = (period: number, seed: number): Signal => {
  const fn = (t: number) => { const p = ((t + seed * 7.13) / period) % 1; return p < 0.12 ? Math.sin(p / 0.12 * Math.PI) : 0; };
  const knots: number[] = []; for (const fraction of [0, 0.12]) { const t = ((fraction * period - seed * 7.13) % period + period) % period; if (t > 0 && t < period) knots.push(t); }
  return { id: `pulse-${String(period).replace('.', '-')}`, period, basis: [(t) => fn(t) - fn(0)], knots };
};

/** The boar's pose fields are additive Euler/translation/scale signals; nonlinear tail products expand into three clocks. */
function boarLayers(source: SkinSource, base: SkinSource, clip: ClipName): PoseLayer[] {
  const graze = clip === 'idle.graze', idle = clip !== 'walk', fields: { f: Field; signals: Signal[] }[] = [];
  const add = (bone: string, property: Field['property'], axis: Axis, signals: Signal[]) => { fields.push({ f: { bone, property, axis }, signals }); };
  if (idle) {
    add('body', 'position', 'y', [oscillation(1.5)]); add('body', 'rotation', 'x', [oscillation(1.5)]);
    for (const name of ['neck1', 'neck2']) add(name, 'rotation', 'y', [oscillation(0.37), oscillation(0.91)]);
    if (!graze) add('neck1', 'rotation', 'x', [oscillation(0.53)]);
    add('head', 'rotation', 'x', [oscillation(graze ? 6 : 0.71)]);
    add('head', 'rotation', 'y', [oscillation(0.37), oscillation(0.91), ...(graze ? [oscillation(2.2)] : [])]);
    add('earL', 'rotation', 'x', [pulse(4.3, 435), oscillation(1.3)]); add('earR', 'rotation', 'x', [pulse(5.7, 435.5), oscillation(1.1)]);
    add('earL', 'rotation', 'z', [pulse(graze ? 3.1 : 4.3, 435)]); add('earR', 'rotation', 'z', [pulse(graze ? 4.4 : 5.7, graze ? 435.3 : 435.5)]);
    add('tail', 'rotation', 'z', [oscillation(3.1), oscillation(2.81), oscillation(3.39)]); add('tail', 'rotation', 'x', [oscillation(1.9)]);
  } else add('head', 'rotation', 'y', [oscillation(0.7)]);
  for (const axis of ['x', 'y', 'z'] as const) add('belly', 'scale', axis, [oscillation(1.4 * 2 * Math.PI * 0.45)]);
  base.pose(clip, 0, 0); const samples = fields.map(() => [] as { time: number; value: number }[]);
  for (let i = 0; i <= 3600; i++) { const t = i / 60; source.pose(clip, t, i === 0 ? 0 : 1 / 60); base.pose(clip, 0, 0, t % 1); fields.forEach(({ f }, q) => { samples[q]?.push({ time: t, value: delta(value(source, f), value(base, f), f.property === 'rotation') }); }); }
  const layers = new Map<string, PoseLayer>();
  fields.forEach(({ f, signals }, q) => {
    const bases = signals.flatMap((s) => s.basis), observed = samples[q] ?? [], coefficients = fit(observed, bases);
    const error = Math.max(...observed.map((sample) => Math.abs(sample.value - bases.reduce((sum, fn, i) => sum + fn(sample.time) * (coefficients[i] ?? 0), 0))));
    if (error > 1e-5) throw new Error(`Nonadditive boar field ${clip}/${f.bone}/${f.axis}: ${error}`);
    let offset = 0;
    for (const signal of signals) {
      let layer = layers.get(signal.id); if (layer === undefined) { layer = { id: signal.id, period: signal.period, times: times(signal.period, signal.knots), phaseSteps: 0, phasePeriod: 1, tracks: [] }; layers.set(signal.id, layer); }
      const selected = coefficients.slice(offset, offset + signal.basis.length); offset += signal.basis.length;
      const values = layer.times.map((t) => signal.basis.reduce((sum, fn, i) => sum + fn(t) * (selected[i] ?? 0), 0));
      if (values.some((v) => Math.abs(v) > 1e-7)) layer.tracks.push({ ...f, order: joint(base, f.bone).rotation.order, values });
    }
  });
  return [...layers.values()].filter((layer) => layer.tracks.length > 0);
}

/** Build exact independent pose clocks and the small breathing×gait correction table from the unchanged originals. */
export function bakePoseLayers(kind: 'grey-blob' | 'boar' | 'pine-ranger', source: SkinSource, base: SkinSource, clip: ClipName): PoseLayer[] {
  if (kind === 'grey-blob') return [capture(source, base, clip, 'blob-pulse', Math.PI / 2, field('body', 'scale', 'y'))];
  if (kind === 'boar') return boarLayers(source, base, clip);
  if (clip === 'walk') {
    const period = Math.PI * 2 / 1.6, ticks = times(period), phaseSteps = 64, tracks: PoseLayerTrack[] = [];
    for (const name of ['chest', 'clavicleL', 'shoulderL', 'twistL', 'elbowL', 'handL']) tracks.push({ bone: name, property: 'quaternion', axis: 'x', order: 'XYZ', values: [] });
    for (const t of ticks) for (let p = 0; p <= phaseSteps; p++) {
      source.pose(clip, t, 0, p / phaseSteps); base.pose(clip, 0, 0, p / phaseSteps);
      for (const track of tracks) { const q = joint(base, track.bone).quaternion.clone().invert().multiply(joint(source, track.bone).quaternion); if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w); track.values.push(...q.toArray()); }
    }
    return [{ id: 'breath-with-gait', period, times: ticks, phaseSteps, phasePeriod: 1, tracks: tracks.filter((track) => track.values.some((v, i) => i % 4 === 3 ? Math.abs(v - 1) > 1e-7 : Math.abs(v) > 1e-7)) }];
  }
  const breathFields = [...field('spine', 'rotation', 'x'), ...field('chest', 'rotation', 'x'), ...['clavicleL', 'shoulderL', 'twistL', 'elbowL', 'handL'].flatMap((bone) => field(bone, 'rotation', 'x', 'y', 'z'))];
  const breath = capture(source, base, clip, 'breath', Math.PI * 2 / 1.6, breathFields, clip === 'idle.talk' ? (f, t) => f.bone === 'chest' ? -0.03 * Math.max(0, Math.sin(t * 2.2)) : 0 : undefined);
  const sway = capture(source, base, clip, 'sway', Math.PI * 2 / 0.35, [...field('hips', 'rotation', 'z'), ...field('spine', 'rotation', 'z'), ...['thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL'].flatMap((bone) => field(bone, 'rotation', 'x', 'y', 'z'))]);
  const out = [breath, sway];
  if (clip === 'idle.talk') {
    out.push(capture(source, base, clip, 'talk-gesture', Math.PI * 2 / 2.4, ['clavicleR', 'shoulderR', 'twistR', 'elbowR', 'handR'].flatMap((bone) => field(bone, 'rotation', 'x', 'y', 'z'))));
    out.push(capture(source, base, clip, 'talk-nod', Math.PI * 20, [...field('neck', 'rotation', 'x'), ...field('head', 'rotation', 'x')]));
    out.push(capture(source, base, clip, 'talk-chest', Math.PI * 2 / 2.2, field('chest', 'rotation', 'x'), (f, t) => f.bone === 'chest' ? -0.012 * Math.sin(t * 1.6) : 0));
  }
  return out;
}
