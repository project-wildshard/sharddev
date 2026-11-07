/** CI discovers every enrolled port. A port supplies real raw AS, identical
 * authored inputs and two ABI adapters; the compiler enforces reachability.
 * Retained v0 originals stay hash-pinned execution oracles until cutover. */
import { expect,test } from 'vitest';
import { compileDualScriptV2 } from '../src/sharddev/test/compileDualScriptV2';
import { compileScript } from '../src/sharddev/bake/compileScript';
import type { DualPortFixture } from './fixtures/script-v2-port';

const ports = import.meta.glob<DualPortFixture>('./fixtures/script-v2-ports/*.dual.ts',{ eager: true,import: 'port' });

// Enumerate real source files, not just fixtures. Matching both the scoped
// filename and exact authored text catches a new source or a stale adapter.
const scopedSources = import.meta.glob<string>([
  '../src/shards/pine-hollow/**/*.as','../src/shards/driftwood-isle/**/*.as',
],{ eager: true,query: '?raw',import: 'default' });
const families = [
  ['../src/shards/pine-hollow/','./fixtures/script-v2-ports/pine-'],
  ['../src/shards/driftwood-isle/','./fixtures/script-v2-ports/driftwood-'],
] as const;

test('scoped AS inventory refuses silently unenrolled or stale sources',() => {
  const inventory = Object.entries(scopedSources).map(([path,source]) => {
    const family = families.find(([root]) => path.startsWith(root));
    if (family === undefined) throw new Error('Unrecognized scoped AS source');
    const [root,prefix] = family;
    const virtualPath = path.slice(root.length).replace(/^behaviour\//u,'').replace(/\.as$/u,'.ts');
    const matching = Object.entries(ports).filter(([fixture]) => fixture.startsWith(prefix)).map(([,port]) => port);
    return { path,dual: matching.some(port => port.input.authored.get(virtualPath) === source),
      retained: matching.some(port => port.retainedV0?.path === virtualPath && port.retainedV0.source === source) };
  });
  expect(inventory.filter(row => !row.dual && !row.retained).map(row => row.path).sort()).toEqual([]);
  // Only the two shipping v0 originals survive beside their pure-AS ports.
  // Their fixtures must capture the exact source and verify the pinned v0
  // bytes and execution, rather than silently granting an untested exception.
  expect(inventory.filter(row => row.retained).map(row => row.path).sort()).toEqual([
    '../src/shards/driftwood-isle/behaviour/director.as',
    '../src/shards/pine-hollow/behaviour/director.as',
  ]);
});
for (const [path,port] of Object.entries(ports)) test(`dual-admit real authored closure: ${path}`,async () => {
  const input = port.input, pair = await compileDualScriptV2(input);
  // A candidate compile cannot leak compiler state into the shipping compiler.
  expect(await compileScript(input.legacy.source,{ abi: 1,maximumPages: input.pages,sources: { ...Object.fromEntries(input.authored),...input.legacy.sources } })).toEqual(pair.legacy.bytes);
  expect(pair.authors.map(row => row.path)).toEqual([...input.authored.keys()].sort());
  await port.verify(pair);
});
