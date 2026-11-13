import * as v from 'valibot';
import Ajv from 'ajv';
import { registeredJsonContract, validateRegisteredJson } from '@wildshard/format/registeredJson';
import { encodeCanonicalJson } from './immutable';
import { registeredJsonSchema } from '@wildshard/engine/host/formatJsonSchema';
import { validateNamedJson } from './schemaValidation';

/** A platform section entry with its defining schema identity. */
export interface DefinedSectionEntry {
  readonly name: string;
  readonly path: string;
  readonly schema: string;
  readonly hash: string;
  readonly bytes: number;
}

/** Relative product paths and their canonical bytes, ready for the product writer. */
export interface EmittedSections {
  readonly sections: readonly DefinedSectionEntry[];
  readonly files: ReadonlyMap<string, Uint8Array>;
}

/** Validate serialized named JSON under its existing producer/reader byte bound.
 * The defining schema is independently bounded; no custom-section node cap is
 * imposed on a payload that was already emitted as a named file. Registered
 * names also retain their original defining semantic parser before publication. */
export function validateDefinedJson(schemaBytes: Uint8Array, bytes: Uint8Array, name?: string): unknown {
  const value = validateNamedJson(schemaBytes, bytes, Ajv);
  if (name !== undefined && registeredJsonContract(name) !== undefined) {
    if (new TextDecoder('utf-8', { fatal: true }).decode(schemaBytes) !== encodeCanonicalJson(registeredJsonSchema(name)))
      throw new Error('Registered JSON requires its exact defining format contract');
    validateRegisteredJson(name, value);
  }
  return value;
}

/** Parse authored section values with their defining native grammar. Use when
 * the wire schema is owned separately: defaults, transforms and custom checks
 * still run, without converting that grammar into a different JSON schema. */
export function parseSectionValue<S extends v.GenericSchema>(schema: S, value: unknown): v.InferOutput<S> {
  return v.parse(schema, value);
}

/** Admit both device-tier records with the same defining grammar and native transform/default order. */
export function parseDeviceTierSections<S extends v.GenericSchema>(schema: S, value: unknown): v.InferOutput<v.ObjectSchema<{ readonly phone: S; readonly desktop: S }, undefined>> {
  return v.parse(v.object({ phone: schema, desktop: schema }), value);
}
