import { ItemsSchema, type ShardItems } from '@wildshard/shard-format/items'
import {
  array,
  check,
  exactOptional,
  integer,
  maxLength,
  maxValue,
  minValue,
  number,
  parse,
  pipe,
  record,
  regex,
  strictObject,
  string,
} from 'valibot'

import itemContent from '../content/harvest-items.json' with { type: 'json' }
import content from '../content/harvest.json' with { type: 'json' }

import type { HarvestDrop } from '@wildshard/shard-format/harvestRows'

/** The one admitted harvest declaration, copied by the kit's source compatibility helper. */
export type HarvestContentRow = HarvestDrop
const MAX_ROWS = 64
const MAX_VARIANTS = 128
const id = pipe(string(), regex(/^[a-z][a-zA-Z0-9.:-]*$/u), maxLength(128))
const names = pipe(array(id), maxLength(MAX_VARIANTS))
const rule = pipe(
  strictObject({
    item: id,
    count: pipe(number(), integer(), minValue(1), maxValue(MAX_ROWS)),
    oneOf: exactOptional(names),
    except: exactOptional(names),
    contains: exactOptional(names),
  }),
  check(
    row =>
      [row.oneOf, row.except, row.contains].filter(value => value !== undefined)
        .length <= 1,
    'One harvest selector',
  ),
)
const rules = parse(record(id, pipe(array(rule), maxLength(MAX_ROWS))), content)
const items = parse(ItemsSchema, {
  version: 1,
  rows: [],
  contexts: [],
  catalogue: itemContent,
  loadout: { primary: null, secondary: null, tools: [] },
}).catalogue

/** Copy only referenced old item metadata; an author's existing catalogue remains its own. */
export function legacyHarvestItems(
  identities: readonly string[],
): NonNullable<ShardItems['catalogue']> {
  return [...new Set(identities)].map(identity => {
    const row = items?.find(item => item.id === identity)
    if (row === undefined)
      throw new Error(`Missing kit harvest item: ${identity}`)
    return {
      id: row.id,
      label: row.label,
      icon: row.icon,
      travels: row.travels,
    }
  })
}

/** Copy the former source law over an explicit roster. No kit selector is shipped to the engine. */
export function legacyHarvest(
  kind: string,
  variants: readonly string[],
): HarvestContentRow[] | undefined {
  const roster = parse(names, variants)
  if (new Set(roster).size !== roster.length)
    throw new Error('Duplicate harvest variant')
  const source = Object.hasOwn(rules, kind) ? rules[kind] : undefined
  return source?.flatMap(row => {
    if (
      row.oneOf === undefined &&
      row.except === undefined &&
      row.contains === undefined
    )
      return [{ item: row.item, count: row.count }]
    const selected = roster.filter(
      variant =>
        row.oneOf?.includes(variant) ??
        (row.except === undefined
          ? row.contains?.some(part => variant.includes(part))
          : !row.except.includes(variant)),
    )
    const drops: HarvestContentRow[] = []
    for (let start = 0; start < selected.length; start += MAX_ROWS) {
      drops.push({
        item: row.item,
        count: row.count,
        variants: selected.slice(start, start + MAX_ROWS),
      })
    }
    return drops
  })
}
