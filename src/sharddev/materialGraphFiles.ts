import { assetCost } from '@wildshard/format/product';
import { encodeCanonicalJson } from './immutable';
import { hashAssetBytes } from './assetHandle';

/**
 * D74: every inline material graph of an authored declaration becomes a content-addressed JSON file of its library
 * closure, and its catalogue entry `{ family: 'graph', file: <hash> }`. Graphs were most of a declaration's JSON nodes
 * (Nalati's 28 held 38,093 of the 100,000), and a file is charged by its bytes, not its nodes. One path for every shard:
 * the file's row names the graph's texture params as its dependencies (so they stay in the closure, as the inline graph's
 * did), identical graphs share one file, and the files' bytes join the build's owned assets. A declaration without a
 * look catalogue is returned as it is.
 */
export function lowerMaterialGraphs(declaration: unknown): { readonly declaration: unknown; readonly assets: ReadonlyMap<string, Uint8Array> } {
  const assets = new Map<string, Uint8Array>();
  const look = isRecord(declaration) ? declaration['look'] : undefined, catalogue = isRecord(look) ? look['materials'] : undefined;
  if (!isRecord(declaration) || !isRecord(look) || !isRecord(catalogue)) return { declaration, assets };
  const materials: Record<string, unknown> = { ...catalogue };
  const files: unknown[] = Array.isArray(declaration['files']) ? declaration['files'].slice() : [];
  const library: unknown[] = Array.isArray(declaration['library']) ? declaration['library'].slice() : [];
  const known = new Set(files.flatMap(row => isRecord(row) && typeof row['hash'] === 'string' ? [row['hash']] : []));
  let lowered = false, compressed = 0, resident = 0;
  for (const [id, entry] of Object.entries(materials)) {
    if (!isRecord(entry) || entry['family'] !== 'graph' || !('graph' in entry)) continue;
    const graph = entry['graph'], bytes = new TextEncoder().encode(encodeCanonicalJson(graph)), hash = hashAssetBytes(bytes);
    materials[id] = { family: 'graph', file: hash }; lowered = true;
    if (known.has(hash)) continue;
    known.add(hash); assets.set(hash, bytes);
    const cost = assetCost('json', bytes);
    files.push({ hash, kind: 'json', compressed: bytes.length, decoded: cost.decoded, gpu: cost.gpu, triangles: cost.triangles, draws: cost.draws,
      dependencies: textureParams(graph), critical: false });
    if (!library.includes(hash)) { library.push(hash); compressed += bytes.length; resident += cost.decoded + cost.gpu; }
  }
  if (!lowered) return { declaration, assets };
  return { declaration: { ...declaration, look: { ...look, materials }, files, library, budgets: withLibrary(declaration['budgets'], compressed, resident) }, assets };
}

/** the library budget charged with the files the lowering adds (their textures were already in the closure), as a named
 *  blob's merge charges it */
function withLibrary(budgets: unknown, compressed: number, resident: number): unknown {
  if (!isRecord(budgets) || !isRecord(budgets['library'])) return budgets;
  const library = budgets['library'], add = (value: unknown, by: number): unknown => typeof value === 'number' ? value + by : value;
  return { ...budgets, library: { ...library, compressed: add(library['compressed'], compressed), resident: add(library['resident'], resident),
    ...(library['downloadAllowance'] === undefined ? {} : { downloadAllowance: add(library['downloadAllowance'], compressed) }) } };
}

/** a graph's texture params' files (a lent texture names none: its runtime lends it), once each, in param order */
function textureParams(graph: unknown): string[] {
  const params = isRecord(graph) && isRecord(graph['params']) ? Object.values(graph['params']) : [], refs: string[] = [];
  for (const param of params) {
    if (!isRecord(param) || param['type'] !== 'texture' || param['role'] === 'lent') continue;
    const value = param['value'];
    if (typeof value === 'string' && !refs.includes(value)) refs.push(value);
  }
  return refs;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
