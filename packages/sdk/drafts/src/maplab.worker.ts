// Map Lab's worker: the full numbers (walkable, gentle, every place, the visibility bands) off the main thread, so a
// drag stays smooth on the phone.
import { numbers, slopeDeg, type Field, type PlacePt, type Road } from './maplab-math';

let field: Field | null = null;
let slope: Float32Array | null = null;

interface InitMsg { kind: 'init'; field: Field }
interface RunMsg { kind: 'run'; id: number; places: PlacePt[]; roads: Road[] }

self.onmessage = (e: MessageEvent<InitMsg | RunMsg>): void => {
  const m = e.data;
  if (m.kind === 'init') {
    field = m.field;
    slope = slopeDeg(field);
    return;
  }
  if (!field || !slope) return;
  const { n, seen } = numbers(field, slope, m.places, m.roads);
  postMessage({ id: m.id, n, seen }, { transfer: [seen.buffer] });
};
