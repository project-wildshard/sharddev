/* eslint-disable no-magic-numbers, node/no-sync, unicorn/import-style, unicorn/max-nested-calls, unicorn/no-array-callback-reference, typescript/explicit-function-return-type, typescript/no-unsafe-type-assertion, typescript/prefer-readonly-parameter-types */
// ONE-FORMAT CC24: `wildshard content`'s creature lines, read from a built shard's skin files.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Json = Record<string, unknown>

function record(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {}
}
function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
function get(value: unknown, key: string): unknown {
  return record(value)[key]
}

/** A skin file's row, by its hash. */
function skinRow(
  dir: string,
  paths: ReadonlyMap<string, string>,
  hash: unknown,
): Json | undefined {
  const path = paths.get(text(hash))
  if (path === undefined || path === '') {
    return undefined
  }
  return record(
    get(record(JSON.parse(readFileSync(resolve(dir, path), 'utf8'))), 'row'),
  )
}
function triangleCount(row: Json): number {
  const triangles = get(record(get(row, 'cost')), 'triangles')
  return typeof triangles === 'number' ? triangles : 0
}

/** ONE-FORMAT CC24: one skinned creature's rig, read from its skin file. */
export interface ContentCreature {
  readonly id: string
  readonly bones: number
  readonly triangles: number
  /** CC51b: the phone tier's mesh, when the look names one */
  readonly phone?: number
}

/** CC24: each `platform.skin` look's species with its skin file's joint and triangle counts (CC51b: and its phone mesh's). */
export function skinCreatures(
  dir: string,
  index: Json,
  materials: Json,
): readonly ContentCreature[] {
  const paths = new Map(
    array(get(index, 'files'))
      .map(record)
      .map(file => [text(get(file, 'hash')), text(get(file, 'path'))] as const),
  )
  const looks = array(get(get(materials, 'rows'), 'looks')).map(record)
  return looks
    .filter(look => text(get(look, 'recipe')) === 'platform.skin')
    .flatMap(look => {
      const parameters = record(get(look, 'parameters'))
      const row = skinRow(dir, paths, get(parameters, 'skin'))
      if (row === undefined) {
        return []
      }
      const phone = skinRow(dir, paths, get(parameters, 'phone'))
      const joints = array(array(get(record(get(row, 'rig')), 'joints'))[0])
      return [
        {
          id: text(get(look, 'species')),
          bones: joints.length,
          triangles: triangleCount(row),
          ...(phone === undefined ? {} : { phone: triangleCount(phone) }),
        },
      ]
    })
}
