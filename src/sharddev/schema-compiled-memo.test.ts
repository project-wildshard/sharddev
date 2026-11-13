import Ajv from 'ajv';
import { expect, it, vi } from 'vitest';
import { encodeCanonicalJson } from './immutable';
import { validateDefinedSchema, type SchemaValidator } from './schemaValidation';

// CI6: a schema compiles once per exact text; every later call still validates the value and refuses with the same text.
const schema = { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', required: ['n'], properties: { n: { type: 'number', maximum: 3 } } };
const bytes = new TextEncoder().encode(encodeCanonicalJson(schema));
const refusal = (value: unknown): string => { try { validateDefinedSchema(bytes, value, Ajv); return 'passed'; } catch (error) { return String(error); } };

it('a remembered schema refuses and accepts exactly as a fresh compile', () => {
  const compile = freshRefusal();
  for (const value of [{ n: 1 }, { n: 4 }, { n: 'x' }, {}, [], { n: 2 }]) {
    const fresh = compile(value), first = refusal(value), again = refusal(value);
    expect(first).toBe(fresh); expect(again).toBe(fresh);
  }
  expect(refusal({ n: 4 })).toContain('should be <= 3');
});

it('a non-canonical or wrong-draft schema is refused even after its canonical twin compiled', () => {
  expect(refusal({ n: 1 })).toBe('passed');
  const spaced = new TextEncoder().encode(JSON.stringify(schema, null, 1));
  expect(() => validateDefinedSchema(spaced, { n: 1 }, Ajv)).toThrow('canonical draft-07');
  const other = new TextEncoder().encode(encodeCanonicalJson({ ...schema, $schema: 'http://json-schema.org/draft-04/schema#' }));
  expect(() => validateDefinedSchema(other, { n: 1 }, Ajv)).toThrow('canonical draft-07');
});

it('a second copy of the same validator (the other bundle) reuses the compile; a different validator compiles its own', () => {
  const own = { ...schema, properties: { n: { type: 'number', maximum: 5 } } }, text = new TextEncoder().encode(encodeCanonicalJson(own));
  const compiles = vi.spyOn(Ajv.prototype, 'compile');
  try {
    // two classes with the same source (as each bundle's copy of the same pinned Ajv), and one with its own
    const copy = (): SchemaValidator => class extends Ajv {};
    const First = copy(), Second = copy();
    type Instance = InstanceType<typeof Ajv>;
    class Other extends Ajv { override compile(input: Parameters<Instance['compile']>[0]): ReturnType<Instance['compile']> { return super.compile(input); } }
    expect(validateDefinedSchema(text, { n: 4 }, First)).toEqual({ n: 4 });
    expect(() => validateDefinedSchema(text, { n: 6 }, Second)).toThrow('should be <= 5');
    expect(compiles).toHaveBeenCalledTimes(1);
    expect(() => validateDefinedSchema(text, { n: 6 }, Other)).toThrow('should be <= 5');
    expect(compiles).toHaveBeenCalledTimes(2);
  } finally { compiles.mockRestore(); }
});

/** The pre-memo path: a new validator and a new compile for every value. */
function freshRefusal(): (value: unknown) => string {
  return value => {
    const validator = new Ajv({ allErrors: false, strictKeywords: true, unknownFormats: true, jsonPointers: true }), validate = validator.compile(schema);
    return validate(value) === true ? 'passed' : String(new Error(`Custom section value refuses its schema: ${validator.errorsText(validate.errors)}`));
  };
}
