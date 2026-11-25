// oxlint-disable-next-line import/no-nodejs-modules -- check reads the shard repo's and the installed SDK's manifests.
import { existsSync, readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Manifest paths sit beside the project and the SDK.
import { join } from 'node:path';
import type { StepRefusal } from './check';

// SHARD-COMPAT CP18 (meta, J486): one pin per shard repo. A shard repo still lists `@wildshard/format` (and engine,
// while its tests import it), but the SDK chooses both: `wildshard update --pins` sets them to the SDK's own pins in
// the same command, and check refuses any other version. The SDK cannot re-export format instead: its lint refuses
// every re-export (`wildshard/no-reexport`, E434).

const FORMAT = /^(?:npm:@wildshard\/shard-format@)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/u;
const FIELDS = ['dependencies', 'devDependencies'] as const;

type Manifest = Readonly<Record<string, unknown>>;

function isManifest(value: unknown): value is Manifest {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readManifest(file: string): Manifest | undefined {
  if (!existsSync(file)) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return isManifest(parsed) ? parsed : undefined;
}

function listed(manifest: Manifest, field: string, name: string): string | undefined {
  const record = manifest[field];
  if (!isManifest(record)) return undefined;
  const spec = record[name];
  return typeof spec === 'string' ? spec : undefined;
}

function versionOf(name: string, spec: string): string {
  return name === '@wildshard/format' ? (FORMAT.exec(spec)?.[1] ?? spec) : spec;
}

/** The package a pnpm override key targets: its last `parent>` step, without an `@<range>` selector. */
function overridden(key: string): string {
  return (key.split(/>(?=[@A-Za-z])/u).at(-1) ?? key).replace(/(?<=.)@[^@/]*$/u, '');
}

/** The format under either name: the `@wildshard/format` alias a repo pins, or `@wildshard/shard-format`, the name
 * kit depends on it by. An override of either at another version links a second format beside the SDK's
 * (shard-nalati on 0.4.33: named-JSON provenance refused the build). */
const FORMAT_NAMES: ReadonlySet<string> = new Set(['@wildshard/format', '@wildshard/shard-format']);

/** The SDK's own pins: format from its dependencies, engine from its devDependencies (the engine its dev runs). */
export function sdkPins(sdkRoot: string): ReadonlyMap<string, string> {
  const sdk = readManifest(join(sdkRoot, 'package.json'));
  const pins = new Map<string, string>();
  if (sdk === undefined) return pins;
  const format = listed(sdk, 'dependencies', '@wildshard/format');
  const engine = listed(sdk, 'devDependencies', '@wildshard/engine');
  if (format !== undefined) pins.set('@wildshard/format', versionOf('@wildshard/format', format));
  if (engine !== undefined) pins.set('@wildshard/engine', engine);
  return pins;
}

/** A refusal for each format or engine pin (or pnpm override) in the project that is not the SDK's. */
export function pinRefusals(project: string, pins: ReadonlyMap<string, string>): StepRefusal[] {
  const manifest = readManifest(join(project, 'package.json'));
  if (manifest === undefined) return [];
  const pnpm = manifest['pnpm'];
  const overrides: Manifest = isManifest(pnpm) ? pnpm : {};
  const refusals: StepRefusal[] = [];
  const overrideRecord = overrides['overrides'];
  const overrideKeys = isManifest(overrideRecord) ? Object.keys(overrideRecord) : [];
  for (const [name, want] of pins) {
    // Every override that targets this package, under any key form; the format under both its names.
    const targets = (key: string): boolean => name === '@wildshard/format' ? FORMAT_NAMES.has(overridden(key)) : key === name;
    // Each spec with how to find it: a dependency or a bare-name override by its name, any other override by its key.
    const specs: [string, string | undefined][] = [
      ...FIELDS.map((field): [string, string | undefined] => [name, listed(manifest, field, name)]),
      ...overrideKeys.filter(targets).map((key): [string, string | undefined] => [key === name ? name : `pnpm.overrides ${key}`, listed(overrides, 'overrides', key)]),
    ];
    for (const [label, spec] of specs) {
      if (spec === undefined || versionOf(name, spec) === want) continue;
      refusals.push({
        message: `package.json pins ${label} ${spec}; the SDK pins ${want}. Run \`wildshard update --pins\`: a shard repo takes format and engine from its SDK (SHARD-COMPAT CP18)`,
        file: 'package.json',
      });
    }
  }
  return refusals;
}
