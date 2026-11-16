#!/usr/bin/env node
// Keep staged CLI/CI paths in the scaffold lane. pnpm appends arguments to
// the last command of an && script, which incorrectly sent them to author lint.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

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
const author=file=>/^(?:src\/(?:sharddev|commons|shards)\/|packages\/(?:kit\/src|upload\/src\/sharddev)\/|codemods\/)/u.test(file);
const jobs=files.length===0?[['lint:kit',kitOptions],['lint:author',[]]]:
  [['lint:kit',[...kitOptions,...files.filter(file=>!author(file))]],['lint:author',files.filter(author)]]
    .filter(([name,paths])=>name==='lint:kit'?paths.length>kitOptions.length:paths.length>0);
const manifest=JSON.parse(readFileSync(new URL('../test/ci21-sdk-tail.json',import.meta.url),'utf8'));
const ports=[...manifest.files.map(file=>file.targetPath),...manifest.supportPaths];
if(files.length===0)jobs.push(['lint:ci21',[]]);
else {const selected=files.filter(file=>ports.includes(file));if(selected.length>0)jobs.push(['lint:ci21',selected]);}
for(const [name,paths] of jobs){
  const run=spawnSync('pnpm',['run',name,...paths],{stdio:'inherit'});
  if(run.error!==undefined)throw run.error;
  if(run.status!==0){process.exitCode=run.status??1;break;}
}
