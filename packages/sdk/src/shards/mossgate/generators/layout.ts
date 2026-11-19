// MOSSGATE-ZONE MZ9 (J452, Jake 2026-11-19: "We should use way more the 500 by 500 meter ... It should be a full zone"): the
// cell map. The Hollow yard (world.ts `LAYOUT`) stays in the middle; six regions round it fill the 500 m cell, each with its
// own places, and the four entry roads and the paths between regions tie them together. The region rows (MZ11 to MZ17)
// build inside these rects, and the quest line (MZ18) walks these places. North is -z (the yard's north wall is its z0).

/** A region's ground: an axis-aligned rect in cell metres. */
export interface Rect { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }
export interface Region { readonly id: string; readonly name: string; readonly rect: Rect }
/** A named place: a region trigger raises its discovery (MZ16), and the map shows it. */
export interface Place { readonly id: string; readonly name: string; readonly region: string; readonly x: number; readonly z: number }
/** An entry road from a cell edge's gate (the grid's lanes, J352) to the yard. */
export interface Entry { readonly id: 'north' | 'east' | 'south' | 'west'; readonly gate: readonly [number, number]; readonly to: readonly [number, number] }
/** A path between two places (or an entry's end), as the points it walks through. */
export interface Path { readonly from: string; readonly to: string; readonly points: readonly (readonly [number, number])[] }

/** Half the cell: the ground runs -250 to 250 both ways. */
export const HALF = 250;

export const REGIONS: readonly Region[] = [
  { id: 'yard', name: 'The Hollow', rect: { x0: -50, x1: 50, z0: -50, z1: 50 } },
  { id: 'meadow', name: 'Mossling Meadow', rect: { x0: -80, x1: 60, z0: -230, z1: -60 } },
  { id: 'thicket', name: "Greyback's Thicket", rect: { x0: 70, x1: 230, z0: -230, z1: -60 } },
  { id: 'downs', name: 'The Barrow Downs', rect: { x0: 80, x1: 230, z0: -50, z1: 110 } },
  { id: 'bog', name: 'The Bog', rect: { x0: -230, x1: -70, z0: -50, z1: 110 } },
  { id: 'quarry', name: 'The Old Quarry', rect: { x0: -80, x1: 80, z0: 120, z1: 230 } },
  { id: 'ridge', name: 'Lookout Ridge', rect: { x0: -230, x1: -100, z0: -230, z1: -80 } },
];

export const PLACES: readonly Place[] = [
  { id: 'hollow.yard', name: 'The Hollow', region: 'yard', x: 0, z: -4 },
  { id: 'hollow.pond', name: "The Hermit's Pond", region: 'yard', x: -19, z: 0 },
  { id: 'meadow.den', name: 'Mossling Den', region: 'meadow', x: -20, z: -150 },
  { id: 'meadow.stones', name: 'The Standing Stones', region: 'meadow', x: 40, z: -200 },
  { id: 'thicket.clearing', name: "Greyback's Clearing", region: 'thicket', x: 140, z: -140 },
  { id: 'thicket.wallow', name: 'The Sow Wallow', region: 'thicket', x: 200, z: -200 },
  { id: 'downs.barrow', name: 'The Barrow Ring', region: 'downs', x: 170, z: 0 },
  { id: 'downs.cairn', name: 'The Old Cairn', region: 'downs', x: 210, z: 80 },
  { id: 'bog.shrine', name: 'The Sunken Shrine', region: 'bog', x: -160, z: 20 },
  { id: 'bog.mere', name: 'Wisp Mere', region: 'bog', x: -200, z: 80 },
  { id: 'quarry.pit', name: 'The Old Quarry', region: 'quarry', x: 45, z: 200 },
  { id: 'ridge.lookout', name: 'The Lookout', region: 'ridge', x: -190, z: -200 },
];

/** The four gates on the cell's edges (the grid's entry lanes walk 50 m in from each) and where each road meets the yard. */
export const ENTRIES: readonly Entry[] = [
  { id: 'north', gate: [0, -HALF], to: [0, -50] },
  { id: 'east', gate: [HALF, 0], to: [50, 0] },
  { id: 'south', gate: [0, HALF], to: [0, 50] },
  { id: 'west', gate: [-HALF, 0], to: [-50, 0] },
];

/** The paths between regions: from the yard out to each, and on along the main chain's way to the Downs. */
export const PATHS: readonly Path[] = [
  { from: 'hollow.yard', to: 'meadow.den', points: [[0, -50], [-10, -100], [-20, -150]] },
  { from: 'meadow.den', to: 'meadow.stones', points: [[-20, -150], [10, -180], [40, -200]] },
  { from: 'meadow.den', to: 'ridge.lookout', points: [[-20, -150], [-110, -170], [-190, -200]] },
  { from: 'meadow.stones', to: 'thicket.clearing', points: [[40, -200], [90, -160], [140, -140]] },
  { from: 'thicket.clearing', to: 'thicket.wallow', points: [[140, -140], [170, -170], [200, -200]] },
  { from: 'thicket.clearing', to: 'downs.barrow', points: [[140, -140], [160, -60], [170, 0]] },
  { from: 'hollow.yard', to: 'downs.barrow', points: [[50, 0], [110, 0], [170, 0]] },
  { from: 'downs.barrow', to: 'downs.cairn', points: [[170, 0], [195, 40], [210, 80]] },
  { from: 'hollow.yard', to: 'bog.shrine', points: [[-50, 0], [-110, 10], [-160, 20]] },
  { from: 'bog.shrine', to: 'bog.mere', points: [[-160, 20], [-185, 50], [-200, 80]] },
  { from: 'hollow.yard', to: 'quarry.pit', points: [[0, 50], [10, 120], [45, 200]] },
];

/** Whether (x, z) lies in `rect`. */
export function inside(rect: Rect, x: number, z: number): boolean { return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1; }

/** The region (x, z) stands in, or undefined between regions (a path, the wilds). */
export function regionAt(x: number, z: number): Region | undefined { return REGIONS.find((region) => inside(region.rect, x, z)); }
