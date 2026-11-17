// G454: catalogue evidence belongs beside the generator that emits the report.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { hostCatalogue, hostVerdicts, renderHostCatalogue } from '../scripts/gen-host-catalogue.mjs';

function fixture(source: string) {
  const root = mkdtempSync(resolve('tmp/codex-ci21-host-catalogue-'));
  const write = (path: string, text: string) => {
    mkdirSync(resolve(root, path, '..'), { recursive: true });
    writeFileSync(resolve(root, path), text);
  };
  write('src/game/host.ts', 'export function host(options: unknown) { return options; }\nexport class Base {}');
  write('src/shards/sample/runtime/main.ts', source);
  return { root, write, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('catalogue joins section fields and actual callers; pending users grant no pass', () => {
  const f = fixture("import {host} from '../../../game/host'; host('world/props');");
  try {
    f.write('node_modules/@wildshard/format/src/format/sections.ts', "export interface PlatformSections { 'world/props': { props: number[] }; 'ui/ui': { title: string } }");
    f.write('src/shards/second/runtime/main.ts', "import {host} from '../../../game/host'; host({answer:7});");
    const reference = { fields: [{ path: '$.props', type: 'array' }], abi: [{ name: 'query' }], contract: { version: 0 } };
    const result = hostCatalogue(f.root, reference), called = result.hosts.find(row => row.export === 'host'), planned = result.hosts.find(row => row.export === 'Base');
    expect(called?.users).toEqual(['sample', 'second']);
    expect(called?.verdicts['twoRealUsers']?.status).toBe('needs-review');
    expect(called?.verdicts['dataOnly']?.status).toBe('needs-review');
    expect(planned).toBeUndefined();
    expect(result.sections[1]?.fields.map(field => field.name)).toEqual(['props']);
    expect(result.sections[1]?.hosts).toEqual(['src/game/host.ts#host']);
    expect(result.sections[1]?.users).toEqual(['sample']);
    expect(result.fields).toEqual(reference.fields);
    expect(result.wasm.signatures).toEqual(reference.abi);
    expect(renderHostCatalogue(result)).toContain('world/props');
    expect(hostCatalogue(f.root, reference)).toEqual(result);
  } finally { f.close(); }
});

test('review credit expires on changed source and never overrides callbacks', () => {
  const audit = { sourceHash: 'exact', evidence: 'reviewed source and live entry reach', verdicts: { twoRealUsers: 'pass', noShardNouns: 'pass', dataOnly: 'pass', serverSafe: 'fail', deletionTest: 'pass' } };
  const callbacks = [{ module: 'src/game/host.ts', export: 'host', file: 'src/shards/sample/runtime/main.ts', start: 0, end: 1, path: 'arg0', message: 'callback' }];
  const exact = hostVerdicts(['sample'], callbacks, audit, 'exact');
  expect(exact['noShardNouns']?.status).toBe('pass');
  expect(exact['dataOnly']?.status).toBe('fail');
  expect(exact['serverSafe']?.status).toBe('fail');
  expect(exact['twoRealUsers']?.status).toBe('pass');
  expect(hostVerdicts(['sample', 'second'], [], audit, 'changed')['twoRealUsers']?.status).toBe('needs-review');
  expect(hostVerdicts(['sample'], [], audit, 'changed')['noShardNouns']?.status).toBe('needs-review');
});
