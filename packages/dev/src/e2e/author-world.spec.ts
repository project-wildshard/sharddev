/* oxlint-disable typescript/prefer-readonly-parameter-types -- Playwright handles represent live, mutable browser objects. */
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { number, object, parse, string } from 'valibot'

import { expect, test } from '../../scripts/browser-test.mjs'
import { KEYCHAIN_ARGS } from '../../scripts/chromium-keychain.mjs'
import { devClient } from '../sharddev/devClient.ts'

import type { Browser, Page, Response } from '@playwright/test'

test.use({
  launchOptions: {
    args: [
      ...KEYCHAIN_ARGS,
      ...(process.platform === 'darwin'
        ? ['--use-angle=metal', '--ignore-gpu-blocklist']
        : []),
    ],
  },
})

const devRoot = path.resolve(import.meta.dirname, '../..')
const template = 'author-world'
const control = 'window.__wildshard?.world?.player !== undefined'

async function boot(page: Readonly<Page>, url: string): Promise<void> {
  await page.goto(`${url}?skipintro&mute=1&nolock=1&fps=30`)
  const skip = page.locator('#ws-name-box [data-name=skip]')
  await Promise.race([skip.click(), page.waitForFunction(control)]).catch(
    async (): Promise<void> => {
      await page.waitForFunction(control)
    },
  )
  await page.waitForFunction(control)
}

// oxlint-disable-next-line eslint/max-statements, eslint/max-lines-per-function -- This fixture owns the author process, browser and directory together.
async function authorWorld(
  browser: Readonly<Browser>,
  verb: 'dev' | 'watch',
  prove: (page: Readonly<Page>, source: string, url: string) => Promise<void>,
): Promise<void> {
  const scratch = path.resolve(
    devRoot,
    '../../tmp',
    process.env['WS_LANE_NAME'] ?? 'author-world-e2e',
  )
  mkdirSync(scratch, { recursive: true })
  const run = mkdtempSync(path.join(scratch, `${verb}-`))
  try {
    const client = await devClient()
    const bin = execFileSync(
      process.execPath,
      [
        '--import',
        '@wildshard/engine/scripts/sim-node-loader.mjs',
        '--input-type=module',
        '-e',
        'import { installWildshard } from "./src/test/helpers/install.ts"; console.log(installWildshard(process.argv[1]))',
        run,
      ],
      { cwd: devRoot, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .at(-1)
    if (bin === undefined) {
      throw new Error('The packaged author CLI was not installed')
    }
    const cwd = path.join(run, 'app')
    execFileSync(process.execPath, [bin, 'new', template, template], { cwd })
    const source = path.join(cwd, template, 'src')
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const cli = spawn(process.execPath, [bin, verb, source], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, WILDSHARD_DEV_CLIENT: client },
    })
    const closed = once(cli, 'close')
    let log = ''
    cli.stdout.on('data', (chunk: Readonly<Buffer>): void => {
      log += chunk.toString()
    })
    cli.stderr.on('data', (chunk: Readonly<Buffer>): void => {
      log += chunk.toString()
    })
    const address = (): string | undefined =>
      /wildshard (?:dev|watch): (?<url>http:\/\/127\.0\.0\.1:\d+\/)\?skipintro/u.exec(
        log,
      )?.groups?.['url']
    try {
      await expect
        .poll(
          (): string | undefined => {
            if (cli.exitCode !== null) {
              throw new Error(log)
            }
            return address()
          },
          { timeout: 45_000 },
        )
        .toBeDefined()
      const url = address()
      if (url === undefined) {
        throw new Error(log)
      }

      // The author page can reach its own process but cannot use an external service.
      await context.route('**/*', async (route): Promise<void> => {
        await (new URL(route.request().url()).hostname === '127.0.0.1'
          ? route.continue()
          : route.abort())
      })
      const page = await context.newPage(),
        workers: string[] = []
      page.on('worker', (worker): void => {
        workers.push(worker.url())
      })
      await boot(page, url)
      expect(await page.evaluate('Boolean(window.__WS_WORLD__)')).toBe(true)
      await prove(page, source, url)
      expect(
        workers.filter((worker): boolean => /serverWorker/u.test(worker)),
      ).toEqual([])
    } catch (error) {
      await test
        .info()
        .attach('author CLI', { body: log, contentType: 'text/plain' })
      throw error
    } finally {
      await context.close()
      cli.kill('SIGTERM')
      await closed
    }
  } finally {
    rmSync(run, { force: true, recursive: true })
  }
}

test('the packed dev command plays the authored Template over loopback', async ({
  browser,
}): Promise<void> => {
  test.setTimeout(120_000)
  await authorWorld(browser, 'dev', async (page): Promise<void> => {
    await expect(
      page.getByText('Reach the hut', { exact: true }).first(),
    ).toBeVisible()
  })
})

function edit(file: string, from: string, to: string): void {
  const original = readFileSync(file, 'utf8')
  expect(original).toContain(from)
  writeFileSync(file, original.replace(from, to))
}

async function serial(url: string): Promise<number> {
  const response = await fetch(new URL('/__dev/release.json', url))
  const envelope = parse(object({ body: string() }), await response.json())
  return parse(object({ serial: number() }), JSON.parse(envelope.body)).serial
}

const controlFor =
  (field: string): ((response: Readonly<Response>) => boolean) =>
  (response: Readonly<Response>): boolean =>
    new URL(response.url()).pathname === '/__dev/control' &&
    response.request().method() === 'POST' &&
    (response.request().postData() ?? '').includes(field)

async function liveEdit(
  page: Readonly<Page>,
  file: string,
  change: {
    readonly control: string
    readonly from: string
    readonly to: string
  },
): Promise<void> {
  const pending = page.waitForResponse(controlFor(change.control))
  edit(file, change.from, change.to)
  const response = await pending
  expect(response.ok()).toBe(true)
}

test('watch applies ground and collider edits and restarts the world for gameplay edits', async ({
  browser,
}): Promise<void> => {
  test.setTimeout(120_000)
  await authorWorld(
    browser,
    'watch',
    async (page, source, url): Promise<void> => {
      await page.waitForFunction(
        '(window.__wsDevScene?.framedRevision ?? 0) > 0',
      )
      const before = await serial(url)
      await liveEdit(page, path.join(source, 'generators/scene.ts'), {
        control: 'wildshardDevGround',
        from: 'world.ground(heightAt,',
        to: 'world.ground((x, z) => heightAt(x, z) + 0.4 * Math.max(0, 1 - Math.hypot(x, z) / 5),',
      })
      expect(await serial(url)).toBe(before)
      await liveEdit(page, path.join(source, 'generators/world.ts'), {
        control: '"wildshardDevColliders":"yard-walls"',
        from: 'T = 0.75, SINK = 0.25',
        to: 'T = 0.9, SINK = 0.25',
      })
      expect(await serial(url)).toBe(before)
      edit(
        path.join(source, 'data/quests.json'),
        '"Reach the hut"',
        '"Find the grey hut"',
      )
      await expect
        .poll(async (): Promise<number> => await serial(url), {
          timeout: 25_000,
        })
        .toBeGreaterThan(before)
      await expect(
        page.getByText('Find the grey hut', { exact: true }).first(),
      ).toBeVisible({ timeout: 25_000 })
      await page.waitForFunction(control)
    },
  )
})
