import * as v from 'valibot';

/** Authored back-plane deformation, before any vertex or renderer exists. */
export interface AuthorHullFlap {
  yMin: number; y0: number; z0: number; slope: number; keep: number; bulge: number;
}
/** Ordered source family, recolouring recipes and optional measured fur tones. */
export interface AuthorHullRecipe<Palette extends string> {
  label: string;
  rigs: string[];
  hulls: Record<string, string>;
  coats: Record<string, {
    palette: Palette;
    source: [string, string];
    keys: [string, string, string];
    measured?: Record<string, Record<string, [number, number, number]>>;
  }>;
  flaps?: Record<string, AuthorHullFlap>;
  fur?: Record<string, Record<string, { rim: [number, number, number]; sheenColor: [number, number, number] }>>;
}

/** Admit an owned source recipe against the caller's finite palette vocabulary.
 * All object boundaries are strict; optional records stay absent and every
 * scalar is finite. This is source admission, independent of tier resources. */
export function riggedHullRecipeRows<const Palettes extends readonly [string, ...string[]]>(
  input: unknown, palettes: Palettes,
): AuthorHullRecipe<Palettes[number]> {
  const num = v.pipe(v.number(), v.finite()), rgb = v.tuple([num, num, num]);
  const flap = v.strictObject({ yMin: num, y0: num, z0: num, slope: num, keep: num, bulge: num });
  const coat = v.strictObject({
    palette: v.picklist(palettes), source: v.tuple([v.string(), v.string()]),
    keys: v.tuple([v.string(), v.string(), v.string()]),
    measured: v.exactOptional(v.record(v.string(), v.record(v.string(), rgb))),
  });
  return v.parse(v.strictObject({
    label: v.string(), rigs: v.array(v.string()), hulls: v.record(v.string(), v.string()),
    coats: v.record(v.string(), coat), flaps: v.exactOptional(v.record(v.string(), flap)),
    fur: v.exactOptional(v.record(v.string(), v.record(v.string(), v.strictObject({ rim: rgb, sheenColor: rgb })))),
  }), input);
}
