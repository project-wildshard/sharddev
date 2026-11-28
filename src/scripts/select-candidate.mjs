// Ring 3 overrides the entire dependency graph, not only the direct edge.
// An empty input keeps the checked-in frozen install. Candidates are exact
// commit hashes, never executable shell fragments or moving branches.
import { readFileSync, writeFileSync } from 'node:fs';
const choices = [['engine', process.env.CANDIDATE_ENGINE]];
// SDK-SPLIT SP2b: the direct edge is the sdk package's; the overrides live in the workspace root.
const ROOT = 'package.json', SDK = 'packages/sdk/package.json';
const pkg = JSON.parse(readFileSync(ROOT, 'utf8'));
const sdk = JSON.parse(readFileSync(SDK, 'utf8'));
for (const [name, sha] of choices) {
  if (!sha) continue;
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error(`${name}: candidate must be a full commit hash`);
  const spec = `github:project-wildshard/${name}#${sha}`;
  // The engine edge is a devDependency (meta QA69): replace it where it is declared, never add a second edge.
  const field = sdk.devDependencies?.[`@wildshard/${name}`] !== undefined ? 'devDependencies' : 'dependencies';
  sdk[field] ??= {}; sdk[field][`@wildshard/${name}`] = spec;
  pkg.pnpm ??= {}; pkg.pnpm.overrides ??= {};
  pkg.pnpm.overrides[`@wildshard/${name}`] = spec;
}
if (choices.some(([, value]) => value)) {
  writeFileSync(ROOT, `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(SDK, `${JSON.stringify(sdk, null, 2)}\n`);
}
