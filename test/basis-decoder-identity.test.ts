// oxlint-disable-next-line import/no-nodejs-modules -- Native host ports exercise exact installed artifacts, never author files.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Directory and bounded read controls keep native identity strict.
import { readdirSync, realpathSync } from 'node:fs';
import { expect, test } from 'vitest';
import { decoderIdentity } from '../src/sharddev/bake/basisEncoder';
import { readBoundedFile } from '../src/sharddev/sourceReader';

const native = {
  require: createRequire, names: (path: string) => readdirSync(path),
  entries: (path: string) => readdirSync(path, { withFileTypes: true }).map(row => ({ name: row.name, directory: row.isDirectory() })),
  realpath: (path: string) => realpathSync(path), read: readBoundedFile,
};

function worker(view: 'empty' | 'foreign' | 'missing' | 'binding'): typeof createRequire {
  return input => new Proxy(createRequire(input), {
    get(target, key, receiver): unknown {
      if (key === 'cache') return view === 'foreign' ? {
        ...target.cache, '/unrelated/node_modules/@img/sharp-other/lib/sharp-other.node': undefined,
      } : {};
      if (key === 'resolve') return new Proxy(target.resolve, {
        apply(resolveFile, owner, args: unknown[]): unknown {
          if (view === 'missing' && typeof args[0] === 'string' && /^@img\/sharp-[^/]+\/sharp\.node$/u.test(args[0]))
            throw Object.assign(new Error('Missing fixture package'), { code: 'MODULE_NOT_FOUND' });
          const value: unknown = Reflect.apply(resolveFile, owner, args); return value;
        },
      });
      const value: unknown = Reflect.get(target, key, receiver); return value;
    },
    apply(target, owner, args: unknown[]): unknown {
      if (view === 'binding' && typeof args[0] === 'string' && args[0].endsWith('/sharp/lib/sharp.js')) return {};
      const value: unknown = Reflect.apply(target, owner, args); return value;
    },
  });
}

test('exact packaged decoder identity ignores empty and unrelated worker cache views', () => {
  const identity = decoderIdentity(); expect(identity).toMatch(/^[a-f0-9]{64}$/u);
  for (const view of ['empty', 'foreign'] as const) {
    const makeRequire = worker(view);
    expect(Object.keys(makeRequire(import.meta.url).cache)).toHaveLength(view === 'empty' ? 0 : Object.keys(createRequire(import.meta.url).cache).length + 1);
    expect(decoderIdentity({ ...native, require: makeRequire })).toBe(identity);
  }
});

test('a missing packaged decoder still refuses', () => {
  expect(() => decoderIdentity({ ...native, require: worker('missing') })).toThrow('Missing exact packaged Sharp decoder');
});

test('ambiguous native binaries inside the actual package still refuse', () => {
  expect(() => decoderIdentity({ ...native, names: path => [...readdirSync(path), 'sharp-conflicting.node'] }))
    .toThrow('Missing exact packaged Sharp decoder');
});

test('a packaged file differing from the bound Sharp native export refuses', () => {
  expect(() => decoderIdentity({ ...native, require: worker('binding') })).toThrow('Sharp decoder binding differs');
});

test.each(['native', 'library'] as const)('%s bytes remain part of the exact identity', kind => {
  const identity = decoderIdentity(); let changed = 0;
  const actual = decoderIdentity({ ...native, read: (path, maximum) => {
    const bytes = readBoundedFile(path, maximum);
    if ((kind === 'native' && path.endsWith('.node')) || (kind === 'library' && /\.(?:dylib|dll|so(?:\.\d+)*)$/u.test(path))) {
      const copy = bytes.slice(); copy[0] = (copy[0] ?? 0) ^ 1; changed++; return copy;
    }
    return bytes;
  } });
  expect(actual).not.toBe(identity); expect(changed).toBeGreaterThan(0); expect(decoderIdentity()).toBe(identity);
});
