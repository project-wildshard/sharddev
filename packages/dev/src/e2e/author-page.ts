/* oxlint-disable typescript/prefer-readonly-parameter-types -- Playwright handles represent live, mutable browser objects. */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { number, object, parse, string } from 'valibot'

import { expect } from '../../scripts/browser-test.mjs'

import type { Page } from '@playwright/test'

function edit(file: string, from: string, to: string): void {
  const original = readFileSync(file, 'utf8')
  expect(original).toContain(from)
  writeFileSync(file, original.replace(from, to))
}

// A watch rebuild can drop a connection mid-read (hosted ci saw ECONNRESET), so the read retries a few times.
async function readRelease(
  url: string,
  tries: number,
): Promise<globalThis.Response> {
  try {
    return await fetch(new URL('/__dev/release.json', url))
  } catch (error) {
    if (tries <= 1) {
      throw error
    }
    await sleep(250)
    return await readRelease(url, tries - 1)
  }
}

async function serial(url: string): Promise<number> {
  const response = await readRelease(url, 5)
  const envelope = parse(object({ body: string() }), await response.json())
  return parse(object({ serial: number() }), JSON.parse(envelope.body)).serial
}

/** Every main-frame address the page goes to from now on, beside the one it is on. */
function pageAddresses(page: Readonly<Page>): string[] {
  const addresses = [page.url()]
  page.on('framenavigated', (frame): void => {
    addresses.push(frame.url())
  })
  return addresses
}

// CHUNK-PARAM-REMOVAL CP11 (J522): the page is a one-cell world on `/`, and a source edit reloads into it with no page address
// naming a zone. (It boots its inline shard on its own page until CP25; the world socket drops `?chunk=` in CP5.)
async function reloadsIntoOneCell(
  page: Readonly<Page>,
  source: string,
  control: string,
): Promise<void> {
  const addresses = pageAddresses(page),
    cells =
      "JSON.parse(document.getElementById('ws-catalogue')?.textContent ?? 'null')?.grid?.cells?.map(cell => cell.cell)"
  expect(await page.evaluate(cells)).toEqual([[0, 0]])
  const reloaded = page.waitForEvent('load', { timeout: 60_000 })
  edit(
    path.join(source, 'generators/quests.ts'),
    "'Walk up to the hut door'",
    "'Find the hut door'",
  )
  await reloaded
  await page.waitForFunction(control, undefined, { timeout: 60_000 })
  await expect(
    page.getByText('Find the hut door', { exact: true }).first(),
  ).toBeAttached({ timeout: 25_000 })
  expect(
    addresses.filter((address): boolean => {
      const url = new URL(address)
      return url.pathname !== '/' || url.searchParams.has('chunk')
    }),
  ).toEqual([])
}

export { edit, reloadsIntoOneCell, serial }
