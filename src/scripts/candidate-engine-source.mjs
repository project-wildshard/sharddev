// Copied from shard-open-plots src/scripts/candidate-engine-source.mjs (meta QA69); keep the two in step.
// Where the installed candidate engine came from, read from pnpm-lock.yaml. pnpm 10's `pnpm list --json` names no
// `resolved` for a git dependency, so Nalati CI 46047262385 compared undefined with the codeload URL and went red. The
// lockfile's own resolution is the record: a codeload tarball, or a git commit of project-wildshard/engine.
const CODELOAD = 'https://codeload.github.com/project-wildshard/engine/tar.gz/';

/** The producer's exact released engine pin: X.Y.Z, or npm next's exact prerelease X.Y.Z-next.<sha> (J475, FS28).
 *  The producer check and cook-play both read it, so a prerelease pin can't pass one and fail the other (meta QA65). */
export const PRODUCER_PIN = /^\d+\.\d+\.\d+(?:-next\.[0-9a-f]{7,40})?$/u;

/** Every `@wildshard/engine` package the lockfile resolves, as a codeload URL, `git:<repo>#<commit>` or `registry`. */
export function lockedEngineSources(lockText) {
  const sources = new Set();
  for (const [, body] of lockText.matchAll(/^ {2}'?@wildshard\/engine@[^\n]*:\n {4}resolution: \{([^}\n]*)\}/gmu)) {
    const field = name => new RegExp(`(?:^|, )${name}: ([^,]+)`, 'u').exec(body)?.[1]?.trim();
    const tarball = field('tarball'), commit = field('commit'), repo = field('repo');
    if (tarball !== undefined) sources.add(tarball);
    else if (commit !== undefined) {
      sources.add(/[/:]project-wildshard\/engine(?:\.git)?$/u.test(repo ?? '') ? `${CODELOAD}${commit}` : `git:${repo}#${commit}`);
    } else sources.add('registry');
  }
  return [...sources];
}

/** The one engine source the lockfile installs; refuses none or several (a registry copy beside the candidate). */
export function lockedEngineSource(lockText) {
  const sources = lockedEngineSources(lockText);
  if (sources.length !== 1) throw new Error(`pnpm-lock.yaml resolves ${sources.length} @wildshard/engine sources: ${sources.join(', ') || 'none'}`);
  return sources[0];
}

/** The full engine commit behind the producer's pin, checked against the pin (meta QA68). `lookup` gives npm next's
 *  `gitHead` for a prerelease or the `vX.Y.Z` tag's commit for a release. The cook-play candidate defaults to it, so a
 *  hand-typed candidate can't sit on an old engine whose exports the pinned SDK no longer finds. */
export async function pinnedEngineCommit(pin, lookup) {
  if (!PRODUCER_PIN.test(pin ?? '')) throw new Error(`engine pin ${pin} is not X.Y.Z or X.Y.Z-next.<sha>`);
  const short = /-next\.([0-9a-f]+)$/u.exec(pin)?.[1];
  const commit = await lookup(short === undefined ? { tag: `v${pin}` } : { version: pin });
  if (!/^[a-f0-9]{40}$/u.test(commit ?? '')) throw new Error(`engine ${pin}: no full commit found (${commit})`);
  if (short !== undefined && !commit.startsWith(short)) throw new Error(`engine ${pin}: gitHead ${commit} is another commit`);
  return commit;
}

/** The engine pin the sdk package declares: its direct edge, a devDependency since SDK-SPLIT (meta QA69). */
export function declaredEnginePin(sdkPackage) {
  return sdkPackage.dependencies?.['@wildshard/engine'] ?? sdkPackage.devDependencies?.['@wildshard/engine'];
}
