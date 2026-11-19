/* eslint-disable max-lines-per-function, max-statements, no-magic-numbers, node/no-sync, unicorn/explicit-length-check, unicorn/import-style, unicorn/max-nested-calls, unicorn/no-array-callback-reference, unicorn/no-nested-ternary, typescript/array-type, typescript/explicit-function-return-type, typescript/no-unsafe-type-assertion, typescript/prefer-readonly-parameter-types */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { skinCreatures } from './content-creatures.ts'

import type { ContentCreature } from './content-creatures.ts'

type Json = Record<string, unknown>

interface ContentCounts {
  readonly weapons: number
  readonly loadoutWeapons: number
  readonly pickups: number
  readonly hostileSpecies: number
  readonly bodies: number
  readonly groups: number
  readonly brainKinds: number
  readonly creatureStrikes: number
  readonly bossHp: number
  readonly bossStrikes: number
  readonly npcs: number
  readonly dialogueStates: number
  readonly quests: number
  readonly questSteps: number
  readonly interactables: number
  readonly movers: number
  readonly achievements: number
  readonly pois: number
}

interface ContentReport {
  readonly slug: string
  readonly counts: ContentCounts
  readonly short: readonly string[]
  readonly creatures: readonly ContentCreature[]
}

const TEMPLATE_BAR: ReadonlyArray<
  readonly [keyof ContentCounts, number, string]
> = [
  ['loadoutWeapons', 1, 'weapons in loadout'],
  ['pickups', 2, 'placed pickups'],
  ['hostileSpecies', 4, 'hostile species'],
  ['bodies', 12, 'bodies'],
  ['groups', 1, 'creature groups'],
  ['brainKinds', 3, 'brain kinds'],
  ['creatureStrikes', 4, 'creature strikes'],
  ['bossHp', 400, 'boss hp'],
  ['bossStrikes', 3, 'boss strikes'],
  ['npcs', 1, 'NPCs'],
  ['dialogueStates', 2, 'dialogue states'],
  ['quests', 1, 'quests'],
  ['questSteps', 4, 'quest steps'],
  ['interactables', 3, 'interactables'],
  ['movers', 1, 'movers'],
  ['achievements', 2, 'achievements'],
  ['pois', 8, 'POIs'],
]

function record(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {}
}
function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}
function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
function get(value: unknown, key: string): unknown {
  return record(value)[key]
}

function section(dir: string, name: string): Json {
  try {
    return record(
      JSON.parse(
        readFileSync(resolve(dir, 'sections', `${name}.json`), 'utf8'),
      ),
    )
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {}
    }
    throw error
  }
}

function itemRows(items: Json): readonly Json[] {
  return array(get(get(items, 'items'), 'rows')).map(record)
}
function speciesRows(species: Json): readonly Json[] {
  return array(get(get(species, 'rows'), 'species')).map(record)
}
function creaturesOf(creatures: Json): Json {
  return record(get(creatures, 'creatures'))
}
function maxHp(species: readonly Json[]): number {
  return Math.max(
    0,
    ...species.flatMap(row =>
      array(get(row, 'variants'))
        .map(record)
        .map(variant => number(get(variant, 'hp'))),
    ),
  )
}

/** Count both row-authored and native platform-section shapes without reading source. */
function readContent(dir: string, bar?: string): ContentReport {
  const index = record(
    JSON.parse(readFileSync(resolve(dir, 'shard.json'), 'utf8')),
  )
  const items = section(dir, 'combat/items')
  const creatures = creaturesOf(section(dir, 'actors/creatures'))
  const species = speciesRows(section(dir, 'actors/species'))
  const strikes = array(
    get(get(record(section(dir, 'combat/strikes')), 'rows'), 'strikes'),
  ).map(record)
  const nativeStrikes = array(section(dir, 'actors/strikes')).map(record)
  const questSection = record(section(dir, 'quests/quests'))
  const questData = record(get(questSection, 'quests'))
  const quests = (
    Array.isArray(get(questData, 'quests'))
      ? array(get(questData, 'quests'))
      : array(get(questSection, 'quests'))
  ).map(record)
  const host = section(dir, 'quests/host')
  const npcs = array(get(record(section(dir, 'actors/npcs')), 'questNpcs')).map(
    record,
  )
  const ledger = array(
    get(record(section(dir, 'economy/ledger')), 'ledger'),
  ).map(record)
  const movers = array(get(record(section(dir, 'world/movers')), 'movers'))
  const targets = record(section(dir, 'world/targets'))
  const ui = section(dir, 'ui/ui')
  const sourceItems = itemRows(items)
  const weapons = sourceItems.filter(row => text(get(row, 'kind')) === 'weapon')
  const itemData = record(get(items, 'items'))
  const loadout = record(get(itemData, 'loadout'))
  const loadoutIds = [
    text(get(loadout, 'primary')),
    text(get(loadout, 'secondary')),
    ...array(get(loadout, 'weapons')).map(text),
  ].filter(Boolean)
  const spawns = array(get(creatures, 'spawns')).map(record)
  const brains = array(get(creatures, 'brains')).map(record)
  const groups = array(get(creatures, 'groups'))
  const targetRows = record(get(targets, 'rows'))
  const uiTargets = record(get(ui, 'targets'))
  const interactionRows = [
    ...array(get(targetRows, 'itemActions')),
    ...array(get(targetRows, 'interactables')),
    ...array(get(ui, 'interaction')),
    ...array(get(ui, 'braziers')),
    ...array(get(ui, 'talk')),
    ...array(get(uiTargets, 'interactions')),
    ...array(get(uiTargets, 'itemActions')),
  ]
  const nativePrograms = record(section(dir, 'actors/species-programs'))
  const nativeSpecies = array(get(nativePrograms, 'species')).map(record)
  const allSpecies = [...species, ...nativeSpecies]
  const nativeBodies = array(section(dir, 'sim/bodies'))
  // A talk is an NPC too: a row-authored shard's NPCs are its `targets.talks` (Mossgate's Lamplighter and Pond Hermit)
  const talks = array(get(uiTargets, 'talks')).map(record)
  const questNpcs = [...npcs, ...array(get(host, 'npcs')).map(record), ...talks]
  // A placed pickup is a prompt whose scene hands over or refills an item (a rack's sword, a chest's oil)
  const itemActionScenes = new Set(
    [
      ...array(get(targetRows, 'itemActions')),
      ...array(get(uiTargets, 'itemActions')),
    ]
      .map(record)
      .map(row => text(get(row, 'scene')))
      .filter(Boolean),
  )
  const itemPrompts = array(get(uiTargets, 'interactions'))
    .map(record)
    .filter(row => itemActionScenes.has(text(get(row, 'scene'))))
  // A brain's own strike (a ram, a dive) is its species' strike as much as a spawn's
  // a brain names its strike (`strike`), or a challenge pair (`charge`, `close`)
  const brainStrikes = new Map(
    brains.map(row => [
      text(get(row, 'id')),
      text(get(row, 'strike')) ||
        text(get(row, 'charge')) ||
        text(get(row, 'close')),
    ]),
  )
  const dialogue = [
    ...array(get(host, 'dialogue')).map(record),
    ...array(get(questData, 'dialogue')).map(record),
    ...array(get(questSection, 'dialogue')).map(record),
  ]
  const manifest = get(record(section(dir, 'ui/level')), 'manifest')
  const manifestPois = array(get(manifest, 'pois'))
  const targetPois = [
    ...array(get(targets, 'pois')),
    ...array(get(targetRows, 'pois')),
  ]
  const count: ContentCounts = {
    weapons: weapons.length,
    loadoutWeapons: loadoutIds.filter(id =>
      weapons.some(row => text(get(row, 'id')) === id),
    ).length,
    pickups:
      array(get(itemData, 'pickups')).length +
      array(get(targetRows, 'itemScenes')).length +
      array(get(targetRows, 'loot')).length +
      itemPrompts.length,
    hostileSpecies: allSpecies.filter(
      row => get(row, 'aggressive') === true || get(row, 'hostile') === true,
    ).length,
    bodies: Math.max(spawns.length, nativeBodies.length),
    groups: groups.length,
    brainKinds: new Set(
      brains.map(row => text(get(row, 'kind'))).filter(Boolean),
    ).size,
    creatureStrikes:
      new Set(
        spawns
          .filter(
            row =>
              text(get(row, 'strike')) !== '' ||
              (brainStrikes.get(text(get(row, 'brain'))) ?? '') !== '',
          )
          .map(row => text(get(row, 'species'))),
      ).size ||
      new Set(
        [...strikes, ...nativeStrikes]
          .map(row => text(get(row, 'id')))
          .filter(Boolean),
      ).size,
    bossHp: maxHp(allSpecies),
    bossStrikes: [...strikes, ...nativeStrikes].filter(row =>
      /boss|warden|wyrm/u.test(text(get(row, 'id'))),
    ).length,
    npcs: questNpcs.length,
    dialogueStates: dialogue.reduce(
      (total, row) => total + array(get(row, 'nodes')).length,
      0,
    ),
    quests: quests.length,
    questSteps: quests.reduce(
      (total, row) => total + array(get(row, 'steps')).length,
      0,
    ),
    interactables: interactionRows.length,
    movers: movers.length,
    achievements: ledger.reduce(
      (total, row) =>
        total +
        array(get(row, 'rewards')).filter(
          reward => text(get(reward, 'kind')) === 'achievement',
        ).length,
      0,
    ),
    pois: manifestPois.length + targetPois.length,
  }
  const short =
    bar === 'templates'
      ? TEMPLATE_BAR.filter(([key, minimum]) => count[key] < minimum).map(
          ([key, minimum, label]) => `${label}: ${count[key]}/${minimum}`,
        )
      : []
  return {
    slug: text(get(record(get(index, 'identity')), 'slug')) || dir,
    counts: count,
    short,
    creatures: skinCreatures(dir, index, section(dir, 'look/materials')),
  }
}

function formatContent(report: ContentReport, bar?: string): string {
  const values = Object.entries(report.counts)
    .map(([name, value]) => `  ${name}: ${value}`)
    .join('\n')
  const verdict =
    bar === undefined
      ? ''
      : report.short.length === 0
        ? `\nbar ${bar}: pass`
        : `\nbar ${bar}: fail\n${report.short.map(line => `  short ${line}`).join('\n')}`
  const creatures = report.creatures
    .map(
      row =>
        `  creature ${row.id}: ${row.bones} bones, ${row.triangles} triangles${row.phone === undefined ? '' : `, phone ${row.phone}`}`,
    )
    .join('\n')
  return `content ${report.slug}\n${values}${creatures === '' ? '' : `\n${creatures}`}${verdict}\n`
}

export { formatContent, readContent }
