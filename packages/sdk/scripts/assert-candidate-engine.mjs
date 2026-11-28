// Match the installed direct edge, its resolved immutable tarball and
// Node’s actual engine package path before accepting candidate receipts.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import { PRODUCER_PIN, declaredEnginePin, lockedEngineSource } from '../../../src/scripts/candidate-engine-source.mjs';
const engine=process.env.COOKED_ENGINE_CANDIDATE;
assert.match(engine??'',/^[a-f0-9]{40}$/u,'An exact candidate engine is required');
const listed=spawnSync('pnpm',['list','@wildshard/engine','--depth','0','--json'],{encoding:'utf8'});
assert.equal(listed.status,0,listed.stderr);
// Meta QA69: the engine edge is a devDependency since SDK-SPLIT, so read both lists; pnpm 10 names no `resolved` for
// a git dependency, so the lockfile is the record (as in shard-open-plots).
const listedRoot=JSON.parse(listed.stdout)[0];
const installed=listedRoot?.dependencies?.['@wildshard/engine']??listedRoot?.devDependencies?.['@wildshard/engine'];assert.ok(installed);
const producer=process.argv.includes('--producer');
const resolved=installed.resolved??lockedEngineSource(readFileSync('../../pnpm-lock.yaml','utf8'));
if(producer){
 const declared=declaredEnginePin(JSON.parse(readFileSync('package.json','utf8')));
 // J475/FS28: npm next carries an exact prerelease, X.Y.Z-next.<sha>, before the tag.
 assert.match(declared??'',PRODUCER_PIN,'Producer uses its exact released pin');
 assert.equal(installed.version,declared);
 assert.notEqual(resolved,`https://codeload.github.com/project-wildshard/engine/tar.gz/${engine}`);
}else assert.equal(resolved,`https://codeload.github.com/project-wildshard/engine/tar.gz/${engine}`);
assert.equal(realpathSync(installed.path),realpathSync(dirname(fileURLToPath(import.meta.resolve('@wildshard/engine/package.json')))));
const result={complete:true,engine:producer?installed.version:engine,resolved,version:installed.version};
const directory=process.env.COOKED_REPORT_DIR??'tmp/cooked-templates';mkdirSync(directory,{recursive:true});
writeFileSync(join(directory,producer?'producer.json':'runtime.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
