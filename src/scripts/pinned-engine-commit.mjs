// The cooked-templates candidate: the dispatch input when one is given, else the exact engine commit the sdk package
// pins (meta QA69, after Open Plots' QA68). The hand-typed default sat on an 11-16 engine whose exports predate
// host/headlessFolder. Writes COOKED_ENGINE_CANDIDATE to GITHUB_ENV and `engine` to GITHUB_OUTPUT.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { declaredEnginePin, pinnedEngineCommit } from './candidate-engine-source.mjs';

const lookup = async ({ tag, version }) => {
  if (version !== undefined) {
    const response = await fetch(`https://registry.npmjs.org/@wildshard%2fengine/${version}`);
    if (!response.ok) throw new Error(`npm @wildshard/engine@${version}: HTTP ${response.status}`);
    return (await response.json()).gitHead;
  }
  const refs = execFileSync('git', ['ls-remote', 'https://github.com/project-wildshard/engine.git', `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { encoding: 'utf8' });
  const lines = refs.trim().split('\n').map(line => line.split('\t'));
  return (lines.find(([, ref]) => ref.endsWith('^{}')) ?? lines[0])?.[0];
};

const pin = declaredEnginePin(JSON.parse(readFileSync(new URL('../../packages/sdk/package.json', import.meta.url), 'utf8')));
const given = process.env.COOKED_ENGINE_CANDIDATE ?? '';
const engine = given === '' ? await pinnedEngineCommit(pin, lookup) : given;
if (!/^[a-f0-9]{40}$/u.test(engine)) throw new Error(`candidate engine ${engine} is not a full commit hash`);
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `COOKED_ENGINE_CANDIDATE=${engine}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `engine=${engine}\n`);
console.log(given === '' ? `candidate engine ${engine} (the sdk's pin ${pin})` : `candidate engine ${engine} (dispatch input)`);
