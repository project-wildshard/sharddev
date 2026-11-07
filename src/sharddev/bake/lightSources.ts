import { Color, Vector3 } from 'three';
import { array, check, maxLength, parse, pipe } from 'valibot';
import { LightPoolRowSchema } from '@wildshard/format/lightEmitters';

/** Ordered numeric author input for a static irradiance bake; colours are already linear. */
export interface AuthoredLightEmitter {
  id: string;
  at: [number, number, number];
  colour: [number, number, number];
  gain: number;
  radius: number;
  cut: number;
  initially?: boolean;
}

/** A detached light source, without a renderer uniform or mutable emitter host. */
export interface BakedLightSource {
  at: Vector3;
  color: Color;
  k: number;
  r: number;
  cut: number;
}

/** Admit the original bounded pool contract and materialise its initial sources in authored order. */
export function bakeLightSources(input: readonly AuthoredLightEmitter[]): BakedLightSource[] {
  const rows = parse(pipe(array(LightPoolRowSchema), maxLength(16384),
    check(values => new Set(values.map(row => row.id)).size === values.length, 'Unique emitter ids')), input);
  return rows.map(row => ({ at: new Vector3(...row.at), color: new Color().setRGB(...row.colour),
    k: row.initially ? row.gain : 0, r: row.radius, cut: row.cut }));
}
