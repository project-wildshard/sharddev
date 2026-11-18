// meta SDK-SPLIT SP13k: every sharddev package resolves ONE shard-format version. kit 0.4.5 pinned 0.28.0 while sdk and
// build pinned 0.26.0; a shard that installed both got two format copies and its build stopped with "Named JSON
// provenance requires a defining shared format root" (Nalati). The format moves for all six packages at once or not at
// all: when sharddev moves, bump every pin and the root override together.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const FORMAT = '@wildshard/shard-format';
const GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/** The shard-format version a dependency spec names: a direct pin, or an `npm:` alias such as `@wildshard/format`. */
function formatVersion(name, spec) {
  const alias = /^npm:@wildshard\/shard-format@(.+)$/u.exec(spec);
  if (alias !== null) return alias[1];
  return name === FORMAT ? spec : undefined;
}

/** `where group name -> version` for every shard-format pin in the given manifests and the root's pnpm.overrides. */
function formatPins(manifests) {
  const pins = {};
  for (const [where, manifest] of Object.entries(manifests)) {
    const groups = GROUPS.map(group => [group, manifest[group]]);
    groups.push(['pnpm.overrides', manifest.pnpm?.overrides]);
    for (const [group, deps] of groups)
      for (const [name, spec] of Object.entries(deps ?? {})) {
        const version = formatVersion(name.replace(/^.*>/u, ''), spec);
        if (version !== undefined) pins[`${where} ${group} ${name}`] = version;
      }
  }
  return pins;
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const manifests = { 'package.json': readJson('package.json') };
for (const dir of readdirSync('packages'))
  manifests[`packages/${dir}`] = readJson(join('packages', dir, 'package.json'));

test('formatPins reads direct pins, npm aliases and overrides', () => {
  const pins = formatPins({
    a: { dependencies: { '@wildshard/format': 'npm:@wildshard/shard-format@0.26.0' } },
    b: { dependencies: { [FORMAT]: '0.28.0', valibot: '1.5.0' } },
    c: { pnpm: { overrides: { 'x>@wildshard/shard-format': '0.26.0' } } },
  });
  assert.deepEqual(pins, {
    'a dependencies @wildshard/format': '0.26.0',
    'b dependencies @wildshard/shard-format': '0.28.0',
    'c pnpm.overrides x>@wildshard/shard-format': '0.26.0',
  });
});

test('every sharddev package pins the same shard-format version', () => {
  const pins = formatPins(manifests);
  assert.ok(Object.keys(pins).length >= 6, `expected a format pin per package, found ${JSON.stringify(pins)}`);
  const versions = new Set(Object.values(pins));
  assert.equal(versions.size, 1, `sharddev packages pin different shard-format versions:\n${JSON.stringify(pins, null, 2)}`);
});

test('the lockfile resolves one shard-format version', () => {
  const lock = readFileSync('pnpm-lock.yaml', 'utf8');
  const versions = new Set([...lock.matchAll(/^ {2}'?@wildshard\/shard-format@([^(':]+)/gmu)].map(match => match[1]));
  assert.equal(versions.size, 1, `pnpm-lock.yaml resolves shard-format ${[...versions].join(', ')}`);
});
