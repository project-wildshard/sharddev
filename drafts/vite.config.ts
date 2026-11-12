// The drafts site's build (WORLDCLAW-TOOLS W16, J57): its own root, its own public/, its own output. Nothing from the
// game's src/ or vite plugins: the two websites share the repo, not a bundle (J15).
//   pnpm drafts:build   → tmp/dist-drafts/ (or $DRAFTS_OUT_DIR)
//   pnpm drafts:dev     → the same site on localhost; /media/* reads the pictures from a local copy (DRAFTS DR2)
// It also emits /version.json (the reload pill's) and /sw.js, the offline worker with this build's file list (E391).
import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { viteTmpRoot } from '../scripts/vite-tmp.mjs';

const root = import.meta.dirname;
const publicDir = join(root, 'public');

function headSha(): string {
  // deploy.sh builds a clean export (no .git) and passes HEAD's sha.
  const { DRAFTS_BUILD_SHA: given } = process.env;
  if (given) return given;
  try { return execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; /* not a git checkout */ }
}
const SHA = headSha();
const BUILD = `${SHA || 'b'}-${Date.now().toString(36)}`;
/** The pictures `pnpm drafts:dev` serves at /media/: a folder laid out as the R2 keys under `drafts/`
 * (<slug>/<hash>-full.webp). By default the DR1 export of the old Blob store, whose `draft/` folder is byte-equal to
 * R2's `drafts/` (DRAFTS DR3). */
const MEDIA = resolve(process.env['DRAFTS_MEDIA_DIR'] ?? join(homedir(), '.cache', 'wildshard', 'drafts-blob-export', 'draft'));
const OUT_DIR = resolve(process.env['DRAFTS_OUT_DIR'] ?? join(root, '..', 'tmp', 'dist-drafts'));

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
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD, sha: SHA, time: new Date().toISOString() }) });
      const code = Object.keys(bundle).filter((f) => f !== 'index.html' && !f.endsWith('.map')).map((f) => `/${f}`);
      // public/ files the app uses (the host's headers are drafts/worker.ts's, DRAFTS DR4)
      const pub = walk(publicDir).map((p) => `/${relative(publicDir, p).split('\\').join('/')}`);
      const precache = ['/', ...code, ...pub];
      const source = readFileSync(join(root, 'src', 'sw.js'), 'utf8')
        .replace("'__BUILD__'", JSON.stringify(BUILD))
        .replace("'__PRECACHE__'", JSON.stringify(JSON.stringify(precache)));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/** `pnpm drafts:dev` only: GET /media/<key> answers the file <MEDIA>/<key>, a WebP, or 404. Never leaves MEDIA. */
function devMedia(): Plugin {
  return {
    name: 'drafts-dev-media',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/media/', (req, res) => {
        const key = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
        const file = resolve(MEDIA, `.${key.startsWith('/') ? key : `/${key}`}`);
        if (!file.startsWith(MEDIA + sep) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end(`not in ${MEDIA}: ${key}`);
          return;
        }
        res.setHeader('Content-Type', file.endsWith('.webp') ? 'image/webp' : 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root,
  publicDir: 'public',
  base: '/',
  define: { __DRAFTS_BUILD__: JSON.stringify(BUILD) },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  server: { port: 5190 },
  plugins: [viteTmpRoot(), draftsPwa(), devMedia()],
});
