import {expect,test} from 'vitest';
import * as v from 'valibot';
import {ChapterStoryPresentationSchema,parseChapterStoryPresentation} from '@wildshard/format/questStory';
import {REGISTERED_JSON,validateRegisteredJson} from '@wildshard/format/registeredJson';
import {platformFileFamily,validatePlatformFile} from '@wildshard/format/platformFileFamilies';
import {registeredJsonSchema,namedFormatJsonSchema,namedJsonSchema} from '../src/sharddev/formatJsonSchema';
import {encodeCanonicalJson} from '../src/sdk/immutable';
import {nameBlob} from '../src/sharddev/blobs';
import {PAGE_STORY as driftwood} from '../src/shards/driftwood-isle/generators/pageStory';
import {PAGE_STORY as pine} from '../src/shards/pine-hollow/generators/pageStory';
import nalati from '../src/shards/nalati-grasslands/data/chapterStory.json' with {type:'json'};

const name='quests/chapters.json',source='@wildshard/format/questStory#ChapterStoryPresentationSchema';
const encode=(value:unknown)=>new TextEncoder().encode(encodeCanonicalJson(value));
const roots=[{slug:'driftwood-isle',value:driftwood.chapters},{slug:'pine-hollow',value:pine.chapters},{slug:'nalati-grasslands',value:nalati}];

test('complete chapter presentation values have three real users without normalization',()=>{
  expect(REGISTERED_JSON[name]).toEqual({schema:ChapterStoryPresentationSchema,source});
  expect(platformFileFamily(name,source)?.schema).toBe(ChapterStoryPresentationSchema);
  for(const {slug,value}of roots) {
    if(value===undefined)throw new Error(`Missing real chapter root: ${slug}`);
    const before=structuredClone(value),original=encode(value);
    expect(v.parse(ChapterStoryPresentationSchema,value)).toEqual(parseChapterStoryPresentation(value));
    validateRegisteredJson(name,value);expect(validatePlatformFile(name,source,value)).toBeDefined();
    expect(value).toEqual(before);expect(encode(value)).toEqual(original);
    expect(nameBlob(name,'json',original,{jsonSchema:registeredJsonSchema(name)}).bytes).toEqual(original);
  }
  expect(registeredJsonSchema(name)).toEqual({...namedJsonSchema(ChapterStoryPresentationSchema),$comment:source});
  expect(namedFormatJsonSchema('questStory.ChapterStoryPresentation')).toEqual(namedJsonSchema(ChapterStoryPresentationSchema));
});

test('chapter family retains original identity, reference and bound refusals',()=>{
  const good=parseChapterStoryPresentation(nalati),chapter=good.chapters[0];
  if(chapter===undefined)throw new Error('Missing actual chapter');
  const invalid=[{...good,chapters:[chapter,chapter]},
    {...good,talks:[{id:'speaker',label:'One',radius:1},{id:'speaker',label:'Two',radius:1}]},
    {...good,rewards:{missing:{event:'reward',title:'Missing chapter'}}},
    {...good,rewardMs:60001},{...good,foreign:true},{chapters:good.chapters}];
  for(const value of invalid) {
    expect(()=>parseChapterStoryPresentation(value)).toThrow();
    expect(()=>validateRegisteredJson(name,value)).toThrow();
    expect(()=>validatePlatformFile(name,source,value)).toThrow();
  }
  expect(platformFileFamily(name,undefined)).toBeUndefined();
  expect(platformFileFamily(name,'@wildshard/format/questStory#QuestStorySchema')).toBeUndefined();
  expect(platformFileFamily('quests/private-chapters.json',source)).toBeUndefined();
  expect(()=>nameBlob(name,'json',encode(good))).toThrow('defining schema');
});
