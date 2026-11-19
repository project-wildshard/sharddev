/* eslint-disable typescript/explicit-function-return-type, typescript/no-unsafe-type-assertion */
// Meta TEMPLATE-E2E TR-12b: `wildshard content`'s POI count. A point of interest is a place a quest marks on the map (an
// intro's or a step's `markers`, at `{ poi: 'world', x, z }`), counted once per place. The legacy level manifest's list
// is not the format's, so it is not read.

type Json = Record<string, unknown>

function get(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)[key]
    : undefined
}
function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

/** The distinct world places the quest rows mark. */
export function markedPlaces(quests: readonly unknown[]): number {
  const places = quests
    .flatMap(row => [get(row, 'intro'), ...array(get(row, 'steps'))])
    .flatMap(at => array(get(at, 'markers')).map(mark => get(mark, 'at')))
    .filter(at => get(at, 'poi') === 'world')
    .map(at => `${String(get(at, 'x'))},${String(get(at, 'z'))}`)
  return new Set(places).size
}
