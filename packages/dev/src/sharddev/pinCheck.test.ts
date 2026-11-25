// oxlint-disable-next-line import/no-nodejs-modules -- Exercise real manifests in a scratch folder.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep fixtures inside the test's owned scratch folder.
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { pinRefusals, sdkPins } from './pinCheck';

// SHARD-COMPAT CP18: a shard repo's format and engine pins are the SDK's; check refuses any other version.
const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest');
mkdirSync(parent, { recursive: true });
const scratch = mkdtempSync(join(parent, 'pin-check-'));
afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

let made = 0;
function folder(manifest: object): string {
  made += 1;
  const dir = join(scratch, String(made));
  mkdirSync(dir);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest)}\n`);
  return dir;
}

const sdk = folder({ dependencies: { '@wildshard/format': 'npm:@wildshard/shard-format@0.68.0' }, devDependencies: { '@wildshard/engine': '0.1.66' } });
const pins = sdkPins(sdk);
const shard = (format: string, engine?: string, override?: string): string => folder({
  devDependencies: { '@wildshard/sharddev': 'npm:@wildshard/sdk@0.4.24', '@wildshard/format': `npm:@wildshard/shard-format@${format}`, ...(engine === undefined ? {} : { '@wildshard/engine': engine }) },
  ...(override === undefined ? {} : { pnpm: { overrides: { '@wildshard/engine': override } } }),
});

describe('pinRefusals', () => {
  it('reads the SDK\'s format from its dependencies and its engine from its devDependencies', () => {
    expect([...pins]).toEqual([['@wildshard/format', '0.68.0'], ['@wildshard/engine', '0.1.66']]);
  });

  it('passes a shard on its SDK\'s pins, with or without engine listed', () => {
    expect(pinRefusals(shard('0.68.0', '0.1.66'), pins)).toEqual([]);
    expect(pinRefusals(shard('0.68.0'), pins)).toEqual([]);
  });

  it('refuses a format pin above or below the SDK\'s, naming both versions', () => {
    for (const format of ['0.69.0', '0.66.0']) {
      const refused = pinRefusals(shard(format), pins);
      expect(refused).toHaveLength(1);
      expect(refused[0]?.message).toMatch(new RegExp(`pins @wildshard/format npm:@wildshard/shard-format@${format.replaceAll('.', '\\.')}; the SDK pins 0\\.68\\.0`, 'u'));
    }
  });

  it('refuses an engine pin or override that is not the SDK\'s', () => {
    expect(pinRefusals(shard('0.68.0', '0.1.67-next.abc'), pins)).toHaveLength(1);
    expect(pinRefusals(shard('0.68.0', '0.1.66', '0.1.60'), pins)).toHaveLength(1);
  });

  it('refuses a format override under either name, by any key, that is not the SDK\'s: a second format beside the SDK\'s', () => {
    // shard-nalati on 0.4.33: `@wildshard/kit>@wildshard/shard-format` stayed at 0.74.1 and kit linked it.
    const withOverrides = (overrides: Record<string, string>): string => folder({
      devDependencies: { '@wildshard/sharddev': 'npm:@wildshard/sdk@0.4.24', '@wildshard/format': 'npm:@wildshard/shard-format@0.68.0' }, pnpm: { overrides } });
    const stale = pinRefusals(withOverrides({ '@wildshard/kit>@wildshard/shard-format': '0.61.0', 'some-tool>@wildshard/format': 'npm:@wildshard/shard-format@0.60.0' }), pins);
    expect(stale.map(refusal => refusal.message)).toEqual([
      expect.stringContaining('pnpm.overrides @wildshard/kit>@wildshard/shard-format 0.61.0; the SDK pins 0.68.0'),
      expect.stringContaining('pnpm.overrides some-tool>@wildshard/format npm:@wildshard/shard-format@0.60.0; the SDK pins 0.68.0')]);
    expect(pinRefusals(withOverrides({ '@wildshard/kit>@wildshard/shard-format': '0.68.0', '@wildshard/format': 'npm:@wildshard/shard-format@0.68.0', 'other>left-alone': '1.0.0' }), pins)).toEqual([]);
  });

  it('judges only against the installed SDK, so a newer format or engine on npm needs no shard commit', () => {
    // The shard pins the SDK exactly; npm has format 0.69.0 and engine 0.1.70 now, and nothing in the shard changes.
    const onSdk = shard('0.68.0', '0.1.66');
    expect(pinRefusals(onSdk, pins)).toEqual([]);
    // Its one opt-in is `wildshard update --pins`, which moves the SDK and both pins together (updatePins.test.ts).
    const nextSdk = sdkPins(folder({ dependencies: { '@wildshard/format': 'npm:@wildshard/shard-format@0.69.0' }, devDependencies: { '@wildshard/engine': '0.1.70' } }));
    expect(pinRefusals(shard('0.69.0', '0.1.70'), nextSdk)).toEqual([]);
  });
});
