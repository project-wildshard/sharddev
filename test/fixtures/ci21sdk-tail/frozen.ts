// oxlint-disable-next-line import/no-nodejs-modules -- Verify the exact frozen predecessor bytes before either parser uses them.
import { readFileSync } from 'node:fs';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';
import pins from './provenance.json' with { type: 'json' };

/** Keep the full captured value and byte identity independent of the author helper. */
export function verifyCi21Fixture(name: keyof typeof pins.files, value: unknown): void {
  const pin = pins.files[name], bytes = readFileSync(new URL(name, import.meta.url));
  if (bytes.length !== pin.bytes || hashImmutableBytes(bytes) !== pin.sha256 || JSON.stringify(value) !== JSON.stringify(JSON.parse(bytes.toString('utf8')))) throw new Error(`Frozen CI21 fixture changed: ${name}`);
}
