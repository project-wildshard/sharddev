#!/usr/bin/env node
// bake-water-ripples.mjs — the pond's tiling ripple normal + foam map at build time (SHARD-PLATFORM frame floor).
//
// src/client/engine/world/water/ripples.ts marched a 256² nine-octave value-noise fbm on the main thread the first time a
// pond or a forest page's water asked for it (~25 ms of Pine's forest-page world step at 4× CPU). The pixels are a pure
// function of src/client/engine/world/water/ripplePixels.ts, so this runs the page's own function in Node (V8, as Chromium) and
// writes the raw RGBA bytes to public/assets/baked/common/water-ripples.bin. A page that fetched it
// (ripples.ts preloadWaterRipples, boot/bakedTextures.ts bakedBytes) builds the byte-identical texture without the
// march. Raw bytes, not an image: no phone / KTX2 copy can make it lossy. Writes only differing bytes; --check
// (bake-check.mjs) fails when stale.
//
//   node --experimental-transform-types --import ./scripts/bake-loader.mjs scripts/bake-water-ripples.mjs [--check]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { byteWriter } from '@wildshard/engine/scripts/bake-output.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const ripples = await import(pathToFileURL(resolve(ROOT, 'src/client/engine/world/water/ripplePixels.ts')).href);
const { WATER_RIPPLES_URL } = await import(pathToFileURL(resolve(ROOT, 'src/client/engine/boot/bakedApi.ts')).href);
const bytes = ripples.waterRipplePixels();
if (bytes.length !== ripples.WATER_RIPPLES_N * ripples.WATER_RIPPLES_N * 4) throw new Error('bake-water-ripples: wrong map size');
const output = byteWriter(check, 'bake-water-ripples');
output.put(resolve(ROOT, `public${WATER_RIPPLES_URL}`), bytes);
output.finish();
