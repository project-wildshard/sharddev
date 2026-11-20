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
import { setTimeout as sleep } from 'node:timers/promises'

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

test('the packed dev command plays the Mossgate starter over loopback', async ({
  browser,
}): Promise<void> => {
  test.setTimeout(120_000)
  await authorWorld(browser, 'dev', async (page): Promise<void> => {
    // The door objective can complete on the first server ticks at spawn.
    await expect(
      page.getByText('Walk up to the hut door', { exact: true }).first(),
    ).toBeAttached()
  })
})

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

const controlFor =
  (field: string): ((response: Readonly<Response>) => boolean) =>
  (response: Readonly<Response>): boolean =>
    new URL(response.url()).pathname === '/__dev/control' &&
    response.request().method() === 'POST' &&
    (response.request().postData() ?? '').includes(field)

async function liveEdit(
  page: Readonly<Page>,
  watch: {
    readonly url: string
    readonly serial: number
  },
  change: {
    readonly file: string
    readonly control: string
    readonly from: string
    readonly to: string
  },
): Promise<void> {
  const pending = page.waitForResponse(controlFor(change.control))
  edit(change.file, change.from, change.to)
  const response = await pending
  expect(response.ok()).toBe(true)
  expect(await serial(watch.url)).toBe(watch.serial)
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
      const watch = {
        url,
        serial: await serial(url),
      }
      await liveEdit(page, watch, {
        file: path.join(source, 'generators/world.ts'),
        control: 'wildshardDevGround',
        from: 'world.ground(groundHeight,',
        to: 'world.ground((x, z) => groundHeight(x, z) + 0.4 * Math.max(0, 1 - Math.hypot(x, z) / 5),',
      })
      await liveEdit(page, watch, {
        file: path.join(source, 'generators/yard.ts'),
        control: '"wildshardDevColliders":"hut"',
        from: 'hx: W / 2, hy: Hh / 2, hz: 0.25, rotY: 0',
        to: 'hx: W / 2, hy: Hh / 2, hz: 0.3, rotY: 0',
      })
      edit(
        path.join(source, 'generators/quests.ts'),
        "'Walk up to the hut door'",
        "'Find the hut door'",
      )
      await expect
        .poll(async (): Promise<number> => await serial(url), {
          timeout: 25_000,
        })
        .toBeGreaterThan(watch.serial)
      await expect(
        page.getByText('Find the hut door', { exact: true }).first(),
      ).toBeAttached({ timeout: 25_000 })
      await expect(
        page.getByText('Walk up to the hut door', { exact: true }),
      ).toHaveCount(0)
      await page.waitForFunction(control)
    },
  )
})
