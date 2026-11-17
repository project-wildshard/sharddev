import { bakeProps, type BakedProps } from '@wildshard/sdk/bake/props';
import { encodeCanonicalJson as canonicalJson } from '@wildshard/sdk/immutable';
import { inkProps } from './props';
import { inkTerrain } from './terrain';

/** The valley's baked world: its terrain (bound to `ground`) and props (bound to `rock`) rows, and every file the map
 *  painter reads by name (the two declaration files and the content-addressed bytes), as the retired launcher wrote them. */
export interface InkWorld {
  readonly terrain: Omit<ReturnType<typeof inkTerrain>, 'assets'>;
  readonly props: BakedProps;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

/** GR9 (G783): bake the ink valley's terrain and props in the build (generate.ts); nothing is written to the source tree. */
export function inkWorld(): InkWorld {
  const files = new Map<string, Uint8Array>(), fixture = inkProps(20), text = new TextEncoder();
  try {
    const { assets: terrainAssets, ...terrain } = inkTerrain(), props = bakeProps(fixture.source);
    for (const [hash, bytes] of [...terrainAssets, ...props.assets]) files.set(`assets/${hash}`, bytes);
    files.set('data/terrain.json', text.encode(`${JSON.stringify(terrain, null, 2)}\n`));
    files.set('data/props.json', text.encode(canonicalJson({ props: props.props, tiles: props.tiles, files: props.files, library: props.library, far: props.far, report: props.report })));
    return { terrain, props, files };
  } finally { fixture.dispose(); }
}
