// The published engine 0.1.47's source worker would resolve a new wire
// descriptor against the old bindings. Pack the fixed worker with the
// same descriptor used by the deployed engine.
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build } from 'rolldown';

const require = createRequire(import.meta.url);
const manifest = require.resolve('@wildshard/engine/package.json');
const engine = JSON.parse(readFileSync(manifest, 'utf8'));
const output = join(import.meta.dirname, '../src/sharddev/engine-0.1.47/headlessWorker.js');
rmSync(output, { force: true });
if (engine.version === '0.1.47' && engine.dependencies?.['@wildshard/wire'] === '^1.2.0') {
  const root = dirname(manifest);
  const engineRequire = createRequire(manifest);
  await build({
    input: join(root, 'src/server/host/bake/headlessWorker.ts'),
    platform: 'node',
    transform: { target: 'node24' },
    plugins: [{
      name: 'engine-0.1.47-dependencies',
      resolveId(source) {
        if (source === '@dimforge/rapier3d-simd') return engineRequire.resolve('@dimforge/rapier3d-simd/rapier.js');
        if (/^\.\/rapier_wasm3d(?:\.js)?$/u.test(source)) return join(root, 'src/server/engine/physics/rapierBindings.ts');
        if (/^@wildshard\/wire(?:\/|$)/u.test(source)) return require.resolve(source);
        return null;
      },
    }],
    output: {
      file: output,
      format: 'esm',
      codeSplitting: false,
    },
  });
}
