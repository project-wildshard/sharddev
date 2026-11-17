import { expect, expectTypeOf, it } from 'vitest';
import type { PlatformSectionName } from '@wildshard/format/sections';
import { emptyShardfile } from '@wildshard/sdk/author';
import { encodeCanonicalJson, hashImmutableBytes } from './immutable';
import { assembleOutputShardfile, parseOutputIndex, type OutputPlatformSectionName } from '@wildshard/format/outputIndex';
import { outputSectionPayloads, OUTPUT_SECTIONS } from '@wildshard/format/outputFields';

it('covers every public platform section name',()=>{expectTypeOf<OutputPlatformSectionName>().toEqualTypeOf<PlatformSectionName>();});

it('roundtrips every platform field without transport metadata', () => {
  const source = emptyShardfile({slug:'index-test',name:'Index',author:'Test',revision:1,seed:9});
  const payloads = outputSectionPayloads(source);
  const index = {format:'wildshard.shardfile',formatVersion:2,sdk:'0.2',version:source.version,identity:source.identity,requires:source.requires,
    build:{sourceHash:'0'.repeat(64),validator:'test'},admission:{budgets:source.budgets,serverBudget:source.serverBudget,authorCaps:source.authorCaps,critical:source.critical,library:source.library},
    sections:[...payloads].map(([name,value]) => { const mapping = OUTPUT_SECTIONS.find(row => row.name === name); if (mapping === undefined) throw new Error('Missing mapping'); const bytes = new TextEncoder().encode(encodeCanonicalJson(value)); return {name,path:`sections/${name}.json`,schema:`wildshard:${name}@1`,hash:hashImmutableBytes(bytes),bytes:bytes.length}; }),schemas:[],files:[],runtime:null};
  expect(assembleOutputShardfile(index,payloads)).toEqual(source);
  expect(() => parseOutputIndex({...index,formatVersion:3})).toThrow();
  expect(() => parseOutputIndex({...index,sections:[...index.sections,index.sections[0]]})).toThrow();
  expect(() => assembleOutputShardfile(index,new Map([...payloads,['custom/extra',{}]]))).toThrow();
});
