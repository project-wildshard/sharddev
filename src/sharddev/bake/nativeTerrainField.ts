import { buildTerrain } from '@wildshard/engine/world/terrainField';
import { CHUNK_HALF, ROAD_WIDTH, ROAD_LENGTH } from '@wildshard/engine/core/config';

/** Mandatory native cell/entry-road dimensions used by the field compiler. */
export function terrainFieldPolicy(): { readonly half: number; readonly roadWidth: typeof ROAD_WIDTH; readonly roadLength: typeof ROAD_LENGTH } {
  return { half: CHUNK_HALF, roadWidth: ROAD_WIDTH, roadLength: ROAD_LENGTH };
}

/** Compile the complete closure-based native author field, including entry roads,
 * trails, graded shelves, pads and water metadata. No runtime owner is installed. */
export function createTerrainField(...args: Parameters<typeof buildTerrain>): ReturnType<typeof buildTerrain> { return buildTerrain(...args); }
