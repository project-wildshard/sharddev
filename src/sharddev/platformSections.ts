import { isJsonData } from '@wildshard/format/json';
import { PLATFORM_DATA_SECTIONS, parsePlatformDataSection, type PlatformDataSectionName } from '@wildshard/format/platformDataSections';
import { parseWorldPhysics, type WorldPhysics } from '@wildshard/format/worldPhysics';
import { encodeCanonicalJson } from './immutable';
import { ownAssetBytes } from './assetOwner';
import { locatedError } from './authorError';
import type { DefinedSectionEntry, EmittedSections } from './sections';
import { parseClientPlan, type ClientPlan } from '@wildshard/format/clientPlan';

/** The platform section names accepted by source-owned composition. */
export type PlatformSectionName = PlatformDataSectionName;

/** Admit source-owned client feature rows with the defining detached/frozen platform contract. */
export function clientPlanSection(input: unknown): ClientPlan { return parseClientPlan(input); }

/** Select the native bake's common fields at build time, keeping owner-specific metadata in its own custom section.
 * The raw source bake remains unchanged. No body, collider, buffer or renderer is constructed by this operation. */
export function worldPhysicsSection(input: unknown, policy: { readonly rig: 'segments' | 'axis'; readonly provenance: 'piece' | 'tagged' }): WorldPhysics {
  if (!isJsonData(input) || typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('Native bake must be plain JSON');
  const fields = new Set(['version', 'ground', 'solids', 'actors', 'parked', 'herds']);
  const value = Object.fromEntries(Object.entries(input).filter(([key]) => fields.has(key)));
  return parseWorldPhysics({ ...value, rig: policy.rig, provenance: policy.provenance });
}

function parsedSection(name: PlatformDataSectionName, input: unknown): ReturnType<typeof parsePlatformDataSection> {
  try { return parsePlatformDataSection(name, input); } catch (error) { throw locatedError(error, `Section ${name}: `); }
}

/** Emit new platform sections through their defining parsers. The product writer merges these independently from
 * custom definitions and the older root-key envelopes, refusing duplicate names across all three sources. */
export function emitPlatformSections(values: ReadonlyMap<PlatformDataSectionName, unknown>): EmittedSections {
  const sections: DefinedSectionEntry[] = [], files = new Map<string, Uint8Array>();
  for (const [name, input] of values) {
    if (!Object.hasOwn(PLATFORM_DATA_SECTIONS, name)) throw new Error(`Unknown platform data section: ${name}`);
    const value = parsedSection(name, input), path = `sections/${name}.json`;
    const owned = ownAssetBytes(new TextEncoder().encode(encodeCanonicalJson(value))), bytes = owned.bytes;
    files.set(path, bytes);
    sections.push({ name, path, schema: `wildshard:${name}@1`, hash: owned.hash, bytes: bytes.length });
  }
  sections.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return { sections, files: new Map([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) };
}
