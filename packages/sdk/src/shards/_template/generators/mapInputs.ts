import { templateTerrain } from './terrain';
import { templatePropRows } from './props';

/** Map rows and immutable geometry from the SAME producers as the product, with no intermediate file reads. */
export function templateMapInputs(): ReadonlyMap<string, Uint8Array> {
  const { assets: terrainAssets, ...terrain } = templateTerrain(), { assets: propsAssets, ...props } = templatePropRows();
  const text = new TextEncoder();
  return new Map([['world-terrain', text.encode(JSON.stringify(terrain))], ['world-props', text.encode(JSON.stringify(props))],
    ...[...terrainAssets, ...propsAssets].map(([hash, bytes]): [string, Uint8Array] => [`assets/${hash}`, bytes])]);
}
