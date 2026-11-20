import { expect, test } from 'vitest'

import { authorStartLinks } from './authorStartLinks'

test.each(['dev', 'watch'] as const)(
  '%s keeps the walk-in line and offers the Explorer',
  command => {
    expect(authorStartLinks(command, 'http://127.0.0.1:4402/')).toEqual([
      `wildshard ${command}: http://127.0.0.1:4402/?skipintro`,
      `wildshard ${command}: explore (fly, inspect) http://127.0.0.1:4402/?explore=world`,
    ])
  },
)
