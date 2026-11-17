// Bakes real-time LODs of the heavy Poly Haven photoscans (100k-tri logs, 40k-tri stumps …)
// into public/assets/models/<id>/<id>_lod.glb using gltf-transform's meshoptimizer simplifier.
// Run after `pnpm assets`:  node scripts/simplify-models.mjs   (idempotent — skips existing)
import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

// id -> target triangle ratio
const LODS = {
  rock_moss_set_01: 0.12,  // 6 boulders, ~11k tris each → ~1.3k
  tree_stump_01: 0.08,     // 41k → ~3.3k
  dead_tree_trunk: 0.035,  // 102k → ~3.6k
  Lantern_01: 0.12,        // 31k → ~3.7k
};

async function exists(p) { try { await access(p); return true; } catch { return false; } }
for (const [id, ratio] of Object.entries(LODS)) {
  const src = join('public/assets/models', id, `${id}.gltf`);
  const dst = join('public/assets/models', id, `${id}_lod.glb`);
  if (await exists(dst)) { console.log('skip', dst); continue; }
  console.log('simplify', id, ratio);
  execFileSync('npx', ['gltf-transform', 'simplify', src, dst, '--ratio', String(ratio), '--error', '0.01'], { stdio: 'inherit' });
}
console.log('done');
