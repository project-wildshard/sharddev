import { describeNavigation, type Navigation } from '@wildshard/format/navigation';
import { navigationCost } from '@wildshard/format/navigationBytes';
import { hashImmutableBytes } from '../immutable';
/** Declare original navigation bytes as platform content; no navcat compilation or byte transform. */
export function declareNavigation(bytes: Uint8Array): { navigation: Navigation; files: { hash: string; kind: 'binary'; compressed: number; decoded: number; gpu: number; triangles: number; draws: number; dependencies: string[]; critical: boolean }[]; critical: string[]; assets: Map<string, Uint8Array> } {
  const hash = hashImmutableBytes(bytes), cost = navigationCost(bytes);
  return { navigation: describeNavigation(hash, bytes), files: [{ hash, kind: 'binary', compressed: bytes.length, ...cost, dependencies: [], critical: true }],
    critical: [hash], assets: new Map([[hash, Uint8Array.from(bytes)]]) };
}

/** Original navigation discovery transport. The platform owns its conventional public URL. */
export function navigationSourceRows(bytes: Uint8Array, slug: string): {
  navigation: Navigation; url: string; files: ReturnType<typeof declareNavigation>['files']; critical: string[];
} {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) throw new Error('Invalid navigation owner');
  const rows = declareNavigation(bytes);
  return { navigation: rows.navigation, url: `/assets/baked/${slug}/navmesh.bin`, files: rows.files, critical: rows.critical };
}
