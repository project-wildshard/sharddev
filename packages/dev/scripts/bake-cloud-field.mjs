#!/usr/bin/env node
// bake-cloud-field.mjs — the engine's tileable cloud fbm at build time (SF67, E461).
//
// src/client/engine/world/cloudField.ts marched 512² six-octave simplex noise on the main thread at load (the audit's ~400 ms
// skyBackdrop.ts task at 4× CPU, Nalati's longest). The field is a pure function of that file and core/noise.ts, so this
// runs the page's own function in Node (V8, as Chromium) and writes the raw grey bytes to public/assets/baked/common/
// cloud-field.bin. A level that declares the file in its boot reads it back (boot/bakedTextures.ts bakedBytes); the
// texture the page builds from it is byte-identical to the marched one. Raw bytes, not an image: no phone / KTX2 copy
// (tex-tiers, bake-ktx2) can make it lossy. Writes only differing bytes; --check (bake-check.mjs) fails when stale.
//
//   node --experimental-transform-types --import ./scripts/bake-loader.mjs scripts/bake-cloud-field.mjs [--check]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { byteWriter } from '@wildshard/engine/scripts/bake-output.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const field = await import(pathToFileURL(resolve(ROOT, 'src/client/engine/world/cloudField.ts')).href);
const { CLOUD_FIELD_URL } = await import(pathToFileURL(resolve(ROOT, 'src/client/engine/boot/bakedApi.ts')).href);
const bytes = field.cloudFieldPixels();
if (bytes.length !== field.CLOUD_FIELD_N * field.CLOUD_FIELD_N) throw new Error('bake-cloud-field: wrong field size');
const output = byteWriter(check, 'bake-cloud-field');
output.put(resolve(ROOT, `public${CLOUD_FIELD_URL}`), bytes);
output.finish();
