// A draft's terrain for Map Lab and Coverage: the height field and region labels under /data/<slug>/ (W6, W17).
import type { Atlas, Terrain } from './atlas';
import type { Field } from './maplab-math';

export async function loadField(a: Atlas, t: Terrain): Promise<Field> {
  const [hb, lb] = await Promise.all([
    fetch(`/data/${a.slug}/${t.heights}`).then((r) => r.arrayBuffer()),
    fetch(`/data/${a.slug}/${t.labels}`).then((r) => r.arrayBuffer()),
  ]);
  const water = t.cats.findIndex((c) => !c.walkable && c.id === 'sea');
  return { res: t.res, size: t.size, heights: new Float32Array(hb), labels: new Uint8Array(lb), water: Math.max(0, water) };
}
