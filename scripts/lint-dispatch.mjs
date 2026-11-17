#!/usr/bin/env node
// Keep staged CLI/CI paths in the scaffold lane. pnpm appends arguments to
// the last command of an && script, which incorrectly sent them to author lint.
// SDK-SPLIT SP2b: the sdk lives in packages/sdk, so its paths lint there (its
// src/.oxlintrc.json and .oxlintrc.author.json match from that folder); the
// root lints kit/, upload's CLI and the author code of upload and kit.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {lintEnvironment} from '../kit/scripts/bin-tools.mjs';

const SDK='packages/sdk/';
const files=[], kitOptions=[];
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--')continue;
  if(arg==='--ignore-pattern'){
    const pattern=args[++i];
    if(pattern===undefined)throw new Error('--ignore-pattern needs a pattern');
    kitOptions.push(arg,pattern);
  }else files.push(arg);
}
const sdkFiles=files.filter(file=>file.startsWith(SDK)).map(file=>file.slice(SDK.length));
const rootFiles=files.filter(file=>!file.startsWith(SDK));
const sdkAuthor=file=>/^(?:src\/(?:sharddev|commons|shards)\/|codemods\/)/u.test(file);
const rootAuthor=file=>/^packages\/(?:kit\/src|upload\/src\/sharddev)\//u.test(file);
const manifest=JSON.parse(readFileSync(new URL('../packages/sdk/test/ci21-sdk-tail.json',import.meta.url),'utf8'));
const ports=[...manifest.files.map(file=>file.targetPath),...manifest.supportPaths];
/** @type {[string, string[], boolean][]} name, paths, in the sdk package */
const jobs=files.length===0
  ?[['lint:kit',kitOptions,false],['lint:author',[],false],['lint:kit',[],true],['lint:author',[],true],['lint:ci21',[],true]]
  :[
    ['lint:kit',[...kitOptions,...rootFiles.filter(file=>!rootAuthor(file))],false],
    ['lint:author',rootFiles.filter(rootAuthor),false],
    ['lint:kit',sdkFiles.filter(file=>!sdkAuthor(file)),true],
    ['lint:author',sdkFiles.filter(sdkAuthor),true],
    ['lint:ci21',sdkFiles.filter(file=>ports.includes(file)),true],
  ].filter(([name,paths,sdk])=>!sdk&&name==='lint:kit'?paths.length>kitOptions.length:paths.length>0);
// The root pins the native lint helper (binDependencies); the sdk package runs with the same one.
const env=lintEnvironment();
for(const [name,paths,sdk] of jobs){
  const command=sdk?['--filter','@wildshard/sdk','run',name,...paths]:['run',name,...paths];
  const run=spawnSync('pnpm',command,{stdio:'inherit',env});
  if(run.error!==undefined)throw run.error;
  if(run.status!==0){process.exitCode=run.status??1;break;}
}
