import * as v from 'valibot';
import type { InteractTable, InteractPlacement } from '@wildshard/engine/world/interact/types';
import { InteractionRowsSchema as schema, parseInteractionRows as parseRows, type InteractionRowsData as Data } from '@wildshard/format/questInteractions';

/** Declared interaction rows: transient marks, prompt / crack rows at named spots with ordered needs and their sets (SF72). */
export const InteractionRowsSchema: v.SchemaWithPipe<readonly [typeof schema]> = v.pipe(schema);
/** Validated interaction rows, run by the platform in the browser and the renderer-free host alike. */
export type InteractionRows = Data;
/** Compile authored interaction rows; an unknown field, a duplicate id or act, or an empty `sets` refuses. */
export function parseInteractionRows(input: unknown): Data { return parseRows(input); }

/** Admit bounded finite placement rows before geometry, registry or prompt effects. */
export function readInteractionPlacements(input: unknown): readonly InteractPlacement[] {
  if (!Array.isArray(input) || input.length > 4096) throw new Error('Invalid interactable placement rows');
  const ids = new Set<string>();
  return input.map((raw: unknown): InteractPlacement => {
    if (typeof raw !== 'object' || raw === null || !('id' in raw) || !('kind' in raw) || !('x' in raw) || !('y' in raw) || !('z' in raw) || !('yaw' in raw)) throw new Error('Invalid interactable placement');
    const { id, kind, x, y, z, yaw } = raw;
    if (typeof id !== 'string' || id.length === 0 || id.length > 256 || ids.has(id) ||
      typeof kind !== 'string' || kind.length === 0 || kind.length > 64 || typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number' || typeof yaw !== 'number' ||
      ![x, y, z, yaw].every(Number.isFinite) || Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > 1000000 || Math.abs(yaw) > 1000000) throw new Error('Invalid or duplicate interactable placement');
    ids.add(id); return { id, kind, x, y, z, yaw };
  });
}
/** Bind each authored rest placement to the same table row, in original order.
 * Missing, foreign or mismatched rows refuse before a table can build. Moving
 * keys and barrel/body state retain their existing runtime owners afterward.
 */
export function bindInteractionPlacements(table: InteractTable, input: unknown): InteractTable {
  const placements = new Map(readInteractionPlacements(input).map(row => [row.id, row]));
  if (placements.size !== table.rows.length || new Set(table.rows.map(row => row.id)).size !== table.rows.length) throw new Error('Incomplete interactable placements');
  const rows = table.rows.map(row => {
    const at = placements.get(row.id);
    if (at === undefined || at.kind !== row.kind) throw new Error(`Unknown interactable placement ${row.id}`);
    return { ...row, at: { poi: 'world' as const, x: at.x, y: at.y, z: at.z, yaw: at.yaw } };
  });
  return { ...table, rows };
}
