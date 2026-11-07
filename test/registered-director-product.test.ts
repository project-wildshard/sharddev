import { expect, test } from 'vitest';
import * as v from 'valibot';
import { DirectorProductSchema } from '@wildshard/format/directorProduct';
import { composeNamedJsonSchema, namedJsonSchema, registeredJsonSchema, namedFormatJsonSchema } from '../src/sharddev/formatJsonSchema';
import { encodeCanonicalJson } from '../src/sdk/immutable';
import { nameBlob } from '../src/sharddev/blobs';
import { REGISTERED_JSON, validateRegisteredJson } from '@wildshard/format/registeredJson';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { emptyShardfile } from '../src/sharddev/author';
import driftwood from '../src/shards/driftwood-isle/data/director.json';
import driftwoodStages from '../src/shards/driftwood-isle/data/finaleStages.json';
import pine from '../src/shards/pine-hollow/data/director.json';
import pineStages from '../src/shards/pine-hollow/data/watchStages.json';

// The complete existing producer grammar, including its optional named file.
const original = composeNamedJsonSchema({ kind: 'object', entries: {
  declaration: 'director.Director',
  module: { kind: 'object', mode: 'strict', entries: {
    module: { kind: 'string' }, bytes: { kind: 'string' },
    file: { kind: 'exact-optional', item: { kind: 'string', min: 1, max: 240 } },
  } }, stages: 'directorStages.DirectorStages', bindings: { kind: 'null' }, seed: { kind: 'number' },
} });
const documents = [
  { declaration: driftwood, stages: driftwoodStages },
  { declaration: pine, stages: pineStages },
].map(({ declaration, stages }) => ({ declaration, stages, module: { module: declaration.module, bytes: '', file: 'behaviour/director.wasm' }, bindings: null, seed: 357 }));

test('complete director root preserves the original composed wire grammar', () => {
  expect(namedJsonSchema(DirectorProductSchema)).toEqual(original);
});

for (const document of documents) {
  test(`${document.declaration.id} keeps authored bytes and native stage defaults separate`, () => {
    const before = structuredClone(document);
    const bytes = new TextEncoder().encode(encodeCanonicalJson(document));
    const admitted = v.parse(DirectorProductSchema, document);
    expect(admitted.declaration).toEqual(document.declaration);
    expect(admitted.stages.stages.map(row => row.id)).toEqual(document.stages.stages.map(row => row.id));
    expect(nameBlob('directors/main.json', 'json', bytes, { jsonSchema: registeredJsonSchema('directors/main.json') }).bytes).toEqual(bytes);
    expect(document).toEqual(before);
  });

  test(`${document.declaration.id} retains every envelope field and bounded child admission`, () => {
    for (const field of Object.keys(document)) {
      const missing: Record<string, unknown> = { ...document };
      delete missing[field];
      expect(() => v.parse(DirectorProductSchema, missing)).toThrow();
    }
    const invalid = [
      { ...document, extra: true },
      { ...document, bindings: {} },
      { ...document, seed: '357' },
      { ...document, declaration: { ...document.declaration, inputs: [{ key: 'bad', min: 1, max: 0 }] } },
      { ...document, stages: { ...document.stages, stages: [{ id: 'ready', next: 'missing' }] } },
      { ...document, module: { ...document.module, file: '' } },
      { ...document, module: { ...document.module, file: 'a'.repeat(241) } },
      { ...document, module: { ...document.module, extra: true } },
    ];
    for (const value of invalid) expect(() => v.parse(DirectorProductSchema, value)).toThrow();
    const { file, ...withoutFile } = document.module;
    expect(file).toBe('behaviour/director.wasm');
    expect(v.parse(DirectorProductSchema, { ...document, module: withoutFile }).module.file).toBeUndefined();
  });
}


test('registered directors name exactly the complete native root', () => {
  const contract = REGISTERED_JSON['directors/main.json'];
  expect(contract.schema).toBe(DirectorProductSchema);
  expect(namedFormatJsonSchema('directorProduct.DirectorProduct')).toEqual(namedJsonSchema(DirectorProductSchema));
  expect(registeredJsonSchema('directors/main.json')).toEqual({ ...namedJsonSchema(DirectorProductSchema), $comment: contract.source });
  for (const document of documents) {
    validateRegisteredJson('directors/main.json', document);
    expect(() => validateRegisteredJson('directors/main.json', { ...document, bindings: {} })).toThrow();
  }
});

test('missing or foreign director provenance refuses before any document read', async () => {
  const identity = { slug: 'director-docs', name: 'Director documents', author: 'Test', revision: 1, seed: 357 };
  for (const jsonSchema of [undefined, {}, { $comment: 'foreign' }]) {
    let reads = 0;
    const product = createShardProduct({ slug: identity.slug, revision: 1, shardfile: emptyShardfile(identity),
      sections: new Map(), builtJson: true,
      files: new Map([['directors/main.json', { hash: 'a'.repeat(64), url: 'main', ...(jsonSchema === undefined ? {} : { jsonSchema }) }]]),
      read: () => { reads++; return Promise.reject(new Error('Unexpected document read')); },
    });
    await expect(product.json('directors/main.json')).rejects.toThrow('unregistered named JSON is retired');
    expect(reads).toBe(0);
  }
});
