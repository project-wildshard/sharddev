import type { Pixels } from '@wildshard/engine/player/viewmodelTextures';

/** The result carries only dimensions and the names whose raw planes were uploaded. */
export interface ViewmodelBake { readonly w: number; readonly h: number; readonly planes: readonly ('col' | 'nrm' | 'arm')[] }

/** Send exact RGBA subviews; encoding and KTX2 cache policy remain in the Node baker. */
export async function sendViewmodelPixels(pixels: Pixels, byteUrl: string, send: typeof fetch = fetch): Promise<ViewmodelBake> {
  if (!Number.isSafeInteger(pixels.w) || !Number.isSafeInteger(pixels.h) || pixels.w < 1 || pixels.h < 1 || pixels.w > 4096 || pixels.h > 4096)
    throw new Error('Invalid viewmodel raster dimensions');
  const expected = pixels.w * pixels.h * 4, planes: ('col' | 'nrm' | 'arm')[] = [];
  for (const name of ['col', 'nrm', 'arm'] as const) {
    const bytes = pixels[name];
    if (bytes === null) continue;
    if (bytes.byteLength !== expected || !(bytes.buffer instanceof ArrayBuffer)) throw new Error('Invalid viewmodel raster plane');
  }
  for (const name of ['col', 'nrm', 'arm'] as const) {
    const bytes = pixels[name];
    if (bytes === null) continue;
    const buffer = bytes.buffer;
    if (!(buffer instanceof ArrayBuffer)) throw new Error('Invalid viewmodel raster storage');
    const response = await send(`${byteUrl}${name}`, { method: 'POST', body: new Uint8Array(buffer, bytes.byteOffset, bytes.byteLength) });
    if (!response.ok) throw new Error(`Viewmodel ${name} byte handoff refused`);
    planes.push(name);
  }
  return { w: pixels.w, h: pixels.h, planes };
}
