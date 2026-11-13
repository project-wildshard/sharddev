import { isJsonData } from '@wildshard/format/json';
import { parseOutputSection } from '@wildshard/format/outputIndex';
import { SHARDFILE_ADMISSION_LIMITS } from '@wildshard/format/admissionLimits';
import { parseShardfile, type Shardfile } from '@wildshard/engine/host/shardfile';
import { encodeCanonicalJson } from './immutable';

/** CLI-only root-mapped section declarations. Existing nonempty fields cannot be overridden. */
export function mergeProjectSections(source: Shardfile, input: unknown): Shardfile {
  if (input === undefined) return source;
  if (!isJsonData(input) || input === null || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length > 256 || new TextEncoder().encode(encodeCanonicalJson(input)).length > SHARDFILE_ADMISSION_LIMITS.sourceBytes) throw new Error('Invalid authored section inventory');
  const result: Record<string, unknown> = { ...source, rows: { ...source.rows }, runtime: source.runtime === null ? null : { ...source.runtime } };
  const set = (target: object, key: string, value: unknown): void => {
    const previous: unknown = Reflect.get(target, key);
    if (previous !== undefined && previous !== null && !(Array.isArray(previous) && previous.length === 0)
      && !(typeof previous === 'object' && !Array.isArray(previous) && Object.keys(previous).length === 0)) throw new Error(`Authored section conflicts with configured field: ${key}`);
    if (!Reflect.set(target, key, value)) throw new Error('Authored section field is not writable');
  };
  for (const [name, payload] of Object.entries(input)) for (const [key, value] of Object.entries(parseOutputSection(name, payload))) {
    if (key === 'rows' || key === 'runtime') {
      const target = result[key];
      if (typeof target !== 'object' || target === null || typeof value !== 'object' || value === null) throw new Error('Authored section requires its declared owner');
      for (const [field, data] of Object.entries(value)) set(target, field, data);
    } else set(result, key, value);
  }
  return parseShardfile(result);
}
