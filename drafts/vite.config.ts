// The drafts site's build (WORLDCLAW-TOOLS W16, J57): its own root, its own public/, its own output. Nothing from the
// game's src/ or vite plugins: the two websites share the repo, not a bundle (J15).
//   pnpm build:drafts   → dist-drafts/
// It also emits /version.json (the reload pill's) and /sw.js, the offline worker with this build's file list (E391).
import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = import.meta.dirname;
const publicDir = join(root, 'public');

function buildId(): string {
  // deploy.sh builds a clean export (no .git) and passes HEAD's sha.
  const { DRAFTS_BUILD_SHA: given } = process.env;
  let sha = given ?? '';
  if (!sha) try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout */ }
  return `${sha || 'b'}-${Date.now().toString(36)}`;
}
const BUILD = buildId();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** version.json and sw.js, stamped with this build and its files. */
function draftsPwa(): Plugin {
  return {
    name: 'drafts-pwa',
    generateBundle(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD, time: new Date().toISOString() }) });
      const code = Object.keys(bundle).filter((f) => f !== 'index.html' && !f.endsWith('.map')).map((f) => `/${f}`);
      // public/ files the app uses (vercel.json is the host's, not the app's)
      const pub = walk(publicDir).map((p) => `/${relative(publicDir, p).split('\\').join('/')}`).filter((u) => u !== '/vercel.json');
      const precache = ['/', ...code, ...pub];
      const source = readFileSync(join(root, 'src', 'sw.js'), 'utf8')
        .replace("'__BUILD__'", JSON.stringify(BUILD))
        .replace("'__PRECACHE__'", JSON.stringify(JSON.stringify(precache)));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  root,
  publicDir: 'public',
  base: '/',
  define: { __DRAFTS_BUILD__: JSON.stringify(BUILD) },
  build: {
    outDir: fileURLToPath(new URL('../dist-drafts', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  plugins: [draftsPwa()],
});
