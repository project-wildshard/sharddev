/** Build-only ordered placement; streams and ground stay borrowed from the author. */
/** Bounded radial or indexed creature placement over an existing stream and ground owner. A radial source draws a math
 * angle (x = cos, z = sin) or a compass bearing (x = sin, z = cos), scaled per axis for an elliptical region. */
export interface CreatureGroupSpec<K extends string = string> {
  readonly kind: K; readonly count: number; readonly herd: number; readonly variant: string | null;
  readonly firstVariant?: string | null; readonly variants?: readonly (string | null)[];
  /** a fixed yaw, or a point every sample faces; omitted, each yaw is a draw after its point */
  readonly yaw?: number; readonly face?: { readonly x: number; readonly z: number };
  readonly source: { readonly kind: 'indexed'; readonly points: readonly { readonly x: number; readonly z: number }[] }
    | { readonly kind: 'radial'; readonly centre: { readonly x: number; readonly z: number }; readonly radius: readonly [number, number];
      readonly axes?: readonly [number, number]; readonly bearing?: 'math' | 'compass';
      readonly firstAtCentre?: boolean; readonly radiusLaw?: 'linear' | 'area'; readonly attempts?: number; readonly fallback?: 'skip' | 'centre' };
  /** Data rejection of a candidate: outside a distance band to a point, inside a clear circle, past a square bound
   *  (|x| or |z|), or ground below `minHeight` (read through the ground owner). */
  readonly accept?: {
    readonly band?: { readonly x: number; readonly z: number; readonly min: number; readonly max: number };
    readonly clear?: readonly { readonly x: number; readonly z: number; readonly r: number }[];
    readonly bound?: number; readonly minHeight?: number;
  };
}
/** Generated pose rows retain their authored kind, variant and herd; materialization remains borrowed. */
export interface CreatureGroupSample<K extends string = string> { readonly kind: K; readonly variant: string | null; readonly herd: number; readonly x: number; readonly z: number; readonly yaw: number }
/** The engine services a group samples through: the caller's random stream and its ground (what `accept.minHeight` reads). */
export interface CreatureGroupStream { readonly next: () => number }
export interface CreatureGroupGround { readonly heightAt: (x: number, z: number) => number }
/** Sample in order from the caller's stream; rejection precedes yaw. */
export function sampleCreatureGroup<K extends string>(row: CreatureGroupSpec<K>, rng: CreatureGroupStream, ground?: CreatureGroupGround): CreatureGroupSample<K>[] {
  const point = (p: { readonly x: number; readonly z: number }): boolean => Number.isFinite(p.x) && Number.isFinite(p.z);
  const variant = (value: string | null): boolean => value === null || value.length > 0 && value.length <= 128;
  const gate = row.accept, band = gate?.band, clear = gate?.clear ?? [], bound = gate?.bound, minHeight = gate?.minHeight;
  if (!row.kind || row.kind.length > 128 || !Number.isSafeInteger(row.count) || row.count < 0 || row.count > 16 || !Number.isSafeInteger(row.herd) || row.herd < -1
    || !variant(row.variant) || row.firstVariant !== undefined && !variant(row.firstVariant) || row.yaw !== undefined && !Number.isFinite(row.yaw)
    || row.face !== undefined && (row.yaw !== undefined || !point(row.face))
    || row.variants !== undefined && (row.variants.length !== row.count || row.variants.some(value => !variant(value)))
    || band !== undefined && (!point(band) || !Number.isFinite(band.min) || !Number.isFinite(band.max) || band.min < 0 || band.max < band.min)
    || clear.length > 16 || clear.some(c => !point(c) || !Number.isFinite(c.r) || c.r < 0)
    || bound !== undefined && !(bound > 0) || minHeight !== undefined && (!Number.isFinite(minHeight) || ground === undefined)) throw new Error('Invalid creature sampling group');
  const source = row.source;
  let attempts = 1, ax = 1, az = 1, compass = false;
  switch (source.kind) {
    case 'indexed':
      if (source.points.length > 1024 || source.points.length < row.count || source.points.some(p => !point(p))) throw new Error('Invalid indexed creature group');
      break;
    case 'radial':
      attempts = source.attempts ?? 1; [ax, az] = source.axes ?? [1, 1]; compass = source.bearing === 'compass';
      if (!point(source.centre) || !Number.isFinite(source.radius[0]) || !Number.isFinite(source.radius[1]) || source.radius[0] < 0 || source.radius[1] < source.radius[0]
        || !Number.isSafeInteger(attempts) || attempts < 1 || attempts > 40 || !['linear', 'area'].includes(source.radiusLaw ?? 'linear')
        || !['skip', 'centre'].includes(source.fallback ?? 'skip') || source.radiusLaw === 'area' && source.radius[0] !== 0
        || !['math', 'compass'].includes(source.bearing ?? 'math') || !Number.isFinite(ax) || !Number.isFinite(az) || !(ax > 0) || !(az > 0)) throw new Error('Invalid radial creature group');
      break;
    default: throw new Error('Unknown creature sampling source');
  }
  const accepts = (x: number, z: number): boolean => {
    if (band !== undefined) { const d = Math.hypot(x - band.x, z - band.z); if (d < band.min || d > band.max) return false; }
    for (const c of clear) if (Math.hypot(x - c.x, z - c.z) < c.r) return false;
    if (bound !== undefined && (Math.abs(x) > bound || Math.abs(z) > bound)) return false;
    return minHeight === undefined || ground === undefined || !(ground.heightAt(x, z) < minHeight);
  };
  const samples: CreatureGroupSample<K>[] = [];
  for (let index = 0; index < 16; index++) {
    if (index >= row.count) break;
    let x = 0, z = 0, accepted = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (attempt >= attempts) break;
      if (source.kind === 'indexed') {
        const p = source.points[index]; if (p === undefined) throw new Error('Missing indexed creature point'); x = p.x; z = p.z;
      } else {
        const [r0, r1] = source.radius, angle = Math.PI * 2 * rng.next();
        const radius = source.firstAtCentre === true && index === 0 && attempt === 0 ? 0 : source.radiusLaw === 'area' ? Math.sqrt(rng.next()) * r1 : r0 + (r1 - r0) * rng.next();
        x = source.centre.x + (compass ? Math.sin(angle) : Math.cos(angle)) * ax * radius;
        z = source.centre.z + (compass ? Math.cos(angle) : Math.sin(angle)) * az * radius;
      }
      if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('Invalid sampled creature point');
      if (accepts(x, z)) { accepted = true; break; }
    }
    if (!accepted) { if (source.kind !== 'radial' || source.fallback !== 'centre') continue; x = source.centre.x; z = source.centre.z; }
    const yaw = row.face !== undefined ? Math.atan2(row.face.x - x, row.face.z - z) : row.yaw ?? Math.PI * 2 * rng.next();
    if (!Number.isFinite(yaw)) throw new Error('Invalid sampled creature yaw');
    samples.push({ kind: row.kind, variant: row.variants === undefined ? index === 0 && row.firstVariant !== undefined ? row.firstVariant : row.variant : row.variants[index] ?? null, x, z, yaw, herd: row.herd });
  }
  return samples;
}

/**
 * Rank at most 1024 borrowed sites, keeping source order on tied scores. Range admission precedes the caller's
 * score callback; greedy spacing follows ranking. Null rejects a site. No random stream or actor is owned here.
 */
export function selectCreatureSites<T extends { readonly x: number; readonly z: number } | { readonly position: { readonly x: number; readonly z: number } }>(sites: readonly T[],
  options: { readonly count: number; readonly origin?: { readonly x: number; readonly z: number }; readonly minDistance?: number; readonly maxDistance?: number; readonly separation?: number },
  score: (site: T, index: number, distance: number) => number | null): { readonly site: T; readonly index: number }[] {
  const point = (site: T): { readonly x: number; readonly z: number } => 'position' in site ? site.position : site;
  const min = options.minDistance ?? 0, max = options.maxDistance ?? Infinity, gap = options.separation ?? 0, origin = options.origin;
  if (sites.length > 1024 || !Number.isSafeInteger(options.count) || options.count < 0 || options.count > 16
    || !Number.isFinite(min) || min < 0 || (options.maxDistance !== undefined && !Number.isFinite(max)) || max < min || !Number.isFinite(gap) || gap < 0
    || (origin === undefined && (options.minDistance !== undefined || options.maxDistance !== undefined))
    || (origin !== undefined && (!Number.isFinite(origin.x) || !Number.isFinite(origin.z)))
    || sites.some(site => { const p = point(site); return !Number.isFinite(p.x) || !Number.isFinite(p.z); })) throw new RangeError('Invalid creature site selection');
  const ranked: { site: T; index: number; score: number }[] = [];
  for (let i = 0; i < 1024; i++) {
    const site = sites[i]; if (site === undefined) break;
    const p = point(site), distance = origin === undefined ? 0 : Math.hypot(p.x - origin.x, p.z - origin.z);
    if (distance < min || distance > max) continue;
    const value = score(site, i, distance);
    if (value === null) continue;
    if (!Number.isFinite(value)) throw new RangeError('Invalid creature site score');
    ranked.push({ site, index: i, score: value });
  }
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  const selected: { site: T; index: number }[] = [];
  for (let i = 0; i < 1024 && selected.length < options.count; i++) {
    const row = ranked[i]; if (row === undefined) break;
    const p = point(row.site);
    if (selected.some(other => { const q = point(other.site); return Math.hypot(q.x - p.x, q.z - p.z) < gap; })) continue;
    selected.push({ site: row.site, index: row.index });
  }
  return selected;
}
