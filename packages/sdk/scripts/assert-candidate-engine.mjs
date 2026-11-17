// Match the installed direct edge, its resolved immutable tarball and
// Node’s actual engine package path before accepting candidate receipts.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const engine=process.env.COOKED_ENGINE_CANDIDATE;
assert.match(engine??'',/^[a-f0-9]{40}$/u,'An exact candidate engine is required');
const listed=spawnSync('pnpm',['list','@wildshard/engine','--depth','0','--json'],{encoding:'utf8'});
assert.equal(listed.status,0,listed.stderr);
const installed=JSON.parse(listed.stdout)[0]?.dependencies?.['@wildshard/engine'];assert.ok(installed);
const producer=process.argv.includes('--producer');
if(producer){
 const declared=JSON.parse(readFileSync('package.json','utf8')).dependencies['@wildshard/engine'];
 assert.match(declared,/^\d+\.\d+\.\d+$/u,'Producer uses its exact released pin');
 assert.equal(installed.version,declared);
 assert.notEqual(installed.resolved,`https://codeload.github.com/project-wildshard/engine/tar.gz/${engine}`);
}else assert.equal(installed.resolved,`https://codeload.github.com/project-wildshard/engine/tar.gz/${engine}`);
assert.equal(realpathSync(installed.path),realpathSync(dirname(fileURLToPath(import.meta.resolve('@wildshard/engine/package.json')))));
const result={complete:true,engine:producer?installed.version:engine,resolved:installed.resolved,version:installed.version};
const directory=process.env.COOKED_REPORT_DIR??'tmp/cooked-templates';mkdirSync(directory,{recursive:true});
writeFileSync(join(directory,producer?'producer.json':'runtime.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
