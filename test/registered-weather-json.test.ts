import * as v from 'valibot';
import {expect,test} from 'vitest';
import {ForestWeatherSchema} from '@wildshard/format/forestWeather';
import {registeredJsonContract,validateRegisteredJson} from '@wildshard/format/registeredJson';
import {registeredJsonSchema,namedJsonSchema} from '@wildshard/sharddev/formatJsonSchema';
import {nameBlob} from '@wildshard/sharddev/blobs';

const name='world/forest-weather.json';
const raw={files:{program:'world/weather.json'},mode:'setting',debug:'weather',heldPhase:0,system:{id:'weather',after:[],before:[]}};
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));

test('weather presentation retains its defining native schema and authored document',()=>{
  const value=structuredClone(raw),bytes=encode(value);
  expect(registeredJsonContract(name).schema).toBe(ForestWeatherSchema);
  expect(registeredJsonSchema(name)).toEqual({...namedJsonSchema(ForestWeatherSchema),$comment:'@wildshard/format/forestWeather#ForestWeatherSchema'});
  v.parse(ForestWeatherSchema,value);validateRegisteredJson(name,value);
  expect(value).toEqual(raw);
  expect(nameBlob(name,'json',bytes,{jsonSchema:registeredJsonSchema(name)}).bytes).toEqual(bytes);
});

test('weather registration retains mutually exclusive owners and complete observation blocks',()=>{
  for(const value of [{...raw,files:{}},{...raw,channels:'weather-lane'}]){
    expect(()=>v.parse(ForestWeatherSchema,value)).toThrow();
    expect(()=>validateRegisteredJson(name,value)).toThrow();
    expect(()=>nameBlob(name,'json',encode(value),{jsonSchema:registeredJsonSchema(name)})).toThrow();
  }
  expect(()=>nameBlob(name,'json',encode(raw))).toThrow('defining schema');
  expect(registeredJsonContract('world/weather.json')?.source).toBe('@wildshard/format/weatherBundle#WeatherDocumentSchema');
});
