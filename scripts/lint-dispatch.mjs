#!/usr/bin/env node
// Keep staged CLI/CI paths in the scaffold lane. pnpm appends arguments to
// the last command of an && script, which incorrectly sent them to author lint.
import {spawnSync} from 'node:child_process';

const files=process.argv.slice(2).filter(file=>file!=='--');
const author=file=>/^src\/(?:sharddev|commons|shards)\//u.test(file);
const jobs=files.length===0?[['lint:kit',[]],['lint:author',[]]]:
  [['lint:kit',files.filter(file=>!author(file))],['lint:author',files.filter(author)]].filter(([,paths])=>paths.length>0);
for(const [name,paths] of jobs){
  const run=spawnSync('pnpm',['run',name,...paths],{stdio:'inherit'});
  if(run.error!==undefined)throw run.error;
  if(run.status!==0){process.exitCode=run.status??1;break;}
}
