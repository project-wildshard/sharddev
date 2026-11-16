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

import content from '../content/harvest.json' with { type: 'json' }

/** Build-only output shape; producer admission uses the released harvest format in OF31b2b. */
export interface HarvestContentRow {
  item: string
  count: number
  variants?: string[]
}
const MAX_ROWS = 64
const id = pipe(string(), regex(/^[a-z][a-zA-Z0-9.:-]*$/u), maxLength(128))
const names = pipe(array(id), maxLength(MAX_ROWS))
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
    return selected.length === 0
      ? []
      : [{ item: row.item, count: row.count, variants: selected }]
  })
}
