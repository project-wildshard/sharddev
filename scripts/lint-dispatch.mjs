#!/usr/bin/env node
// Keep staged CLI/CI paths in the scaffold lane. pnpm appends arguments to
// the last command of an && script, which incorrectly sent them to author lint.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const files=process.argv.slice(2).filter(file=>file!=='--');
const manifest=JSON.parse(readFileSync(new URL('../test/ci21-sdk-tail.json',import.meta.url),'utf8'));
const ports=[...manifest.files.map(file=>file.targetPath),...manifest.supportPaths];
const author=file=>/^(?:src\/(?:sharddev|commons|shards)|packages\/(?:upload\/src\/sharddev|kit\/src\/geometry))\//u.test(file);
const jobs=files.length===0?[['lint:kit',[]],['lint:author',[]]]:
  [['lint:kit',files.filter(file=>!author(file))],['lint:author',files.filter(author)]].filter(([,paths])=>paths.length>0);
if(files.length===0)jobs.push(['lint:ci21',[]]);
else {const selected=files.filter(file=>ports.includes(file));if(selected.length>0)jobs.push(['lint:ci21',selected]);}
for(const [name,paths] of jobs){
  const run=spawnSync('pnpm',['run',name,...paths],{stdio:'inherit'});
  if(run.error!==undefined)throw run.error;
  if(run.status!==0){process.exitCode=run.status??1;break;}
}
