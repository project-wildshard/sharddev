#!/usr/bin/env node
// Keep staged CLI/CI paths in the scaffold lane. pnpm appends arguments to
// the last command of an && script, which incorrectly sent them to author lint.
// SDK-SPLIT SP2b: the sdk lives in packages/sdk, so its paths lint there (its
// src/.oxlintrc.json and .oxlintrc.author.json match from that folder); the
// root lints kit/, upload's CLI and the author code of upload and kit.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {lintEnvironment} from '../kit/scripts/bin-tools.mjs';

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
// SDK-SPLIT SP8c: packages/dev lints the same way from its own folder (its src/.oxlintrc.json and .oxlintrc.author.json).
const PACKAGES=[['packages/sdk/','@wildshard/sdk'],['packages/dev/','@wildshard/dev']];
const owner=file=>PACKAGES.find(([prefix])=>file.startsWith(prefix));
const rootFiles=files.filter(file=>owner(file)===undefined);
const sdkAuthor=file=>/^(?:src\/(?:sharddev|commons|shards)\/|codemods\/)/u.test(file);
const rootAuthor=file=>/^packages\/(?:kit\/src|upload\/src\/sharddev)\//u.test(file);
const manifest=JSON.parse(readFileSync(new URL('../packages/sdk/test/ci21-sdk-tail.json',import.meta.url),'utf8'));
const ports=[...manifest.files.map(file=>file.targetPath),...manifest.supportPaths];
/** @type {[string, string[], string|undefined][]} name, paths, the package that runs it (undefined: the root) */
const jobs=files.length===0
  ?[['lint:kit',kitOptions,undefined],['lint:author',[],undefined],...PACKAGES.flatMap(([,name])=>[['lint:kit',[],name],['lint:author',[],name]]),['lint:ci21',[],'@wildshard/sdk']]
  :[
    ['lint:kit',[...kitOptions,...rootFiles.filter(file=>!rootAuthor(file))],undefined],
    ['lint:author',rootFiles.filter(rootAuthor),undefined],
    ...PACKAGES.flatMap(([prefix,name])=>{
      const own=files.filter(file=>file.startsWith(prefix)).map(file=>file.slice(prefix.length));
      return [['lint:kit',own.filter(file=>!sdkAuthor(file)),name],['lint:author',own.filter(sdkAuthor),name],
        ...(name==='@wildshard/sdk'?[['lint:ci21',own.filter(file=>ports.includes(file)),name]]:[])];
    }),
  ].filter(([name,paths,pkg])=>pkg===undefined&&name==='lint:kit'?paths.length>kitOptions.length:paths.length>0);
// The root pins the native lint helper (binDependencies); the sdk package runs with the same one.
const env=lintEnvironment();
for(const [name,paths,pkg] of jobs){
  const command=pkg!==undefined?['--filter',pkg,'run',name,...paths]:['run',name,...paths];
  const run=spawnSync('pnpm',command,{stdio:'inherit',env});
  if(run.error!==undefined)throw run.error;
  if(run.status!==0){process.exitCode=run.status??1;break;}
}
