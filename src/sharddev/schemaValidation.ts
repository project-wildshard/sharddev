import type Ajv from 'ajv';
import { isJsonData, parseNamedJson } from '@wildshard/format/json';
import { encodeCanonicalJson } from './immutable';

const DRAFT = 'http://json-schema.org/draft-07/schema#';

/** Validate named JSON with the caller's schema compiler under the existing byte bounds. */
export function validateNamedJson(schemaBytes: Uint8Array, bytes: Uint8Array, Validator: SchemaValidator): unknown {
  return validateDefinedSchema(schemaBytes, parseNamedJson(bytes), Validator);
}

/** CI6: each compiled schema by its exact canonical text, per validator (a product names hundreds of JSON blobs under a
 *  few schemas, and every call built a new validator and compiled again). A compiled schema is a pure function of its text;
 *  only a schema text that passed the checks below is kept. Bounded: the oldest goes first.
 *  The table is the process's: a product build loads this module twice, in the shard config's bundle and in the author's,
 *  each with its own copy of the same Ajv, and both validate the same named JSON, so the author's admission compiled every
 *  schema the config had just compiled (Driftwood: 31 schemas, ~0.3 s). A validator is known by its class's source,
 *  so only the same Ajv shares an entry. */
type AjvInstance = InstanceType<typeof Ajv>;
/** What validation constructs: an Ajv (or a subclass of one). */
export type SchemaValidator = new (options?: ConstructorParameters<typeof Ajv>[0]) => AjvInstance;
interface Compiled { readonly validator: AjvInstance; readonly validate: ReturnType<AjvInstance['compile']> }
type CompiledTable = Map<string, Map<string, Compiled>>;
const SHARED = Symbol.for('wildshard.sdk.compiledSchemas/1');
const isTable = (value: unknown): value is CompiledTable => value instanceof Map;
const compiled = ((): CompiledTable => {
  const existing: unknown = Reflect.get(globalThis, SHARED);
  if (isTable(existing)) return existing;
  const table: CompiledTable = new Map();
  Reflect.set(globalThis, SHARED, table); return table;
})();
const validators = new WeakMap<SchemaValidator, string>();
const COMPILED_LIMIT = 256;
/** The validator's identity across bundles: its class's source. */
function validatorKey(Validator: SchemaValidator): string {
  let key = validators.get(Validator);
  if (key === undefined) { key = String(Validator); validators.set(Validator, key); }
  return key;
}

/** Shared canonical draft-07 validation policy; the dependency is supplied only by schema consumers. */
export function validateDefinedSchema(schemaBytes: Uint8Array, value: unknown, Validator: SchemaValidator): unknown {
  if (schemaBytes.length > 1_000_000) throw new Error('Custom section schema exceeds its byte limit');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(schemaBytes);
  const kind = validatorKey(Validator), own = compiled.get(kind), known = own?.get(text);
  if (known !== undefined) {
    if (known.validate(value) !== true) throw new Error(`Custom section value refuses its schema: ${known.validator.errorsText(known.validate.errors)}`);
    return value;
  }
  const schema: unknown = JSON.parse(text);
  if (!isJsonData(schema) || typeof schema !== 'object' || schema === null || !('$schema' in schema) || schema.$schema !== DRAFT || encodeCanonicalJson(schema) !== text) throw new Error('Custom section schema must be canonical draft-07 JSON');
  const validator = new Validator({ allErrors: false, strictKeywords: true, unknownFormats: true, jsonPointers: true });
  const validate = validator.compile(schema);
  if (validate.$async === true) throw new Error('Custom section schemas cannot be asynchronous');
  const table = own ?? new Map<string, Compiled>();
  if (own === undefined) compiled.set(kind, table);
  if (table.size >= COMPILED_LIMIT) { const oldest = table.keys().next().value; if (oldest !== undefined) table.delete(oldest); }
  table.set(text, { validator, validate });
  if (validate(value) !== true) throw new Error(`Custom section value refuses its schema: ${validator.errorsText(validate.errors)}`);
  return value;
}
