// The next alias can lag behind an exact version after trusted publishing.
import { setTimeout as wait } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const packages = ['build', 'cli', 'dev', 'kit', 'sdk', 'upload'].map(name => `@wildshard/${name}`);
const registry = 'https://registry.npmjs.org';

export async function pendingNextPackages(version, read = fetch) {
  const statuses = await Promise.all(packages.map(async name => {
    try {
      const encoded = encodeURIComponent(name);
      const options = {
        headers: { 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(10_000),
      };
      const tags = await read(`${registry}/-/package/${encoded}/dist-tags`, options);
      if (!tags.ok) return `${name} (dist-tags HTTP ${tags.status})`;
      const { next } = await tags.json();
      if (next !== version) return `${name} (next is ${next ?? 'missing'})`;
      const response = await read(`${registry}/${encoded}/next`, options);
      if (!response.ok) return `${name} (HTTP ${response.status})`;
      const { version: actual } = await response.json();
      return actual === version ? undefined : `${name} (next resolves to ${actual ?? 'missing'})`;
    } catch (error) {
      return `${name} (${error.message})`;
    }
  }));
  return statuses.filter(status => status !== undefined);
}

async function main(tag) {
  if (!/^v\d+\.\d+\.\d+$/u.test(tag)) throw new Error('Pass the SDK release tag, such as v0.9.1');
  const seconds = Number(process.env.RELEASE_NPM_WAIT ?? 3600);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('RELEASE_NPM_WAIT must be nonnegative seconds');
  const deadline = Date.now() + seconds * 1000;
  const version = tag.slice(1);
  for (;;) {
    const pending = await pendingNextPackages(version);
    if (pending.length === 0) {
      console.info(`SDK ${version} is on npm next for ${packages.join(', ')}`);
      return;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`npm next has not reached ${version} for ${pending.join(', ')}`);
    console.info(`Waiting for npm next ${version}: ${pending.join(', ')}`);
    await wait(Math.min(30_000, remaining));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { await main(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
