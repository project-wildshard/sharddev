import { expect, test, vi } from 'vitest';
import { BoxGeometry, BufferGeometry, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { Scope } from '../src/shared/engine/app/scope';
import { parseItems } from '@wildshard/format/items';
import { loadItemModels } from '../src/client/game/shardfile/itemModels';
import { staticGlb } from '../src/sharddev/bake/glb';
import { compressGlb } from '../src/sharddev/bake/glbCompression';
import { hashImmutableBytes } from '../src/sdk/immutable';
import ITEMS from '../src/shards/_template/data/items.json' with { type: 'json' };

function inventory(bytes: Uint8Array) {
  const items = parseItems(ITEMS), row = items.rows[0], hash = hashImmutableBytes(bytes);
  if (row === undefined) throw new Error('Missing authored equipment row');
  return { hash, items: { ...items, rows: [{ ...row, view: { ...row.view, asset: hash } }] }, assets: new Map([[hash, bytes]]) };
}
function geometry(root: Object3D | undefined): BufferGeometry {
  let result: BufferGeometry | undefined;
  root?.traverse(node => { if (node instanceof Mesh && node.geometry instanceof BufferGeometry) result = node.geometry; });
  if (result === undefined) throw new Error('Missing decoded model geometry');
  return result;
}

test('entry admits exact compressed model geometry and shares it only through its live owners', async () => {
  const original = new BoxGeometry(1, 2, 3, 3, 3, 3), material = new MeshStandardMaterial();
  const a = new Scope('entry-model-a'), b = new Scope('entry-model-b');
  try {
    const f = inventory(compressGlb(staticGlb([{ geometry: original, material, compactIndex: true }])));
    const first = await loadItemModels(f.items, f.assets, a), second = await loadItemModels(f.items, f.assets, b);
    expect(second.get(f.hash)).toBe(first.get(f.hash));
    const decoded = geometry(first.get(f.hash)), disposed = vi.spyOn(decoded, 'dispose');
    for (const name of ['position', 'normal', 'uv']) expect(decoded.getAttribute(name).array).toEqual(original.getAttribute(name).array);
    expect(decoded.index?.array).toEqual(original.index?.array);
    a.dispose(); await Promise.resolve(); expect(disposed).not.toHaveBeenCalled();
    b.dispose(); await Promise.resolve(); expect(disposed).toHaveBeenCalledOnce();
  } finally { a.dispose(); b.dispose(); original.dispose(); material.dispose(); }
});

test('entry refuses a hash-valid malformed GLB before publishing a model', async () => {
  const f = inventory(new Uint8Array([103, 108, 84, 70])), scope = new Scope('invalid-entry-model');
  try { await expect(loadItemModels(f.items, f.assets, scope)).rejects.toThrow('truncated'); }
  finally { scope.dispose(); }
});
