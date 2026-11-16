import content from '../content/journal-icons.json' with { type: 'json' }

/** Exact former journal glyph bytes for source compilation; authors may supply any admitted image instead. */
export function legacyJournalIcon(name: string): string {
  if (!Object.hasOwn(content, name))
    throw new Error(`Unknown kit journal icon: ${name}`)
  const row = Object.entries(content).find(([id]) => id === name)
  if (row === undefined) throw new Error(`Missing kit journal icon: ${name}`)
  return row[1]
}
