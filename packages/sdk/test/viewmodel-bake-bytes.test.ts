import { expect, test, vi } from 'vitest';
import type { Pixels } from '../src/client/engine/player/viewmodelTextures';
import { sendViewmodelPixels } from '../scripts/bake/viewmodelBytes';

const raster = (): Pixels => ({ w: 1, h: 1, col: new Uint8Array([0, 128, 255, 7]), nrm: new Uint8Array([1, 2, 3, 4]), arm: new Uint8Array([5, 6, 7, 8]) });

test('uploads every exact RGBA subview in order without copying or encoding it', async () => {
  const storage = new Uint8Array([99, 0, 128, 255, 7, 100]), pixels = { ...raster(), col: storage.subarray(1, 5) };
  const send = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 })));
  await expect(sendViewmodelPixels(pixels, 'https://bake.invalid/', send)).resolves.toEqual({ w: 1, h: 1, planes: ['col', 'nrm', 'arm'] });
  expect(send.mock.calls.map(([url]) => url)).toEqual(['https://bake.invalid/col', 'https://bake.invalid/nrm', 'https://bake.invalid/arm']);
  for (const [index, name] of (['col', 'nrm', 'arm'] as const).entries()) {
    const body = send.mock.calls[index]?.[1]?.body, source = pixels[name];
    if (!(body instanceof Uint8Array) || source === null) throw new Error('Missing original plane body');
    expect(body.buffer).toBe(source.buffer); expect(body.byteOffset).toBe(source.byteOffset); expect(body.byteLength).toBe(source.byteLength);
    expect(body).toEqual(source);
  }
  expect(storage).toEqual(new Uint8Array([99, 0, 128, 255, 7, 100]));
});

test('retains absent ARM metadata for the caller to refuse or omit as before', async () => {
  const send = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 })));
  await expect(sendViewmodelPixels({ ...raster(), arm: null }, 'https://bake.invalid/', send)).resolves.toEqual({ w: 1, h: 1, planes: ['col', 'nrm'] });
  expect(send).toHaveBeenCalledTimes(2);
});

test.each([0, 1.5, 4097])('refuses width %s before any upload', async w => {
  const send = vi.fn<typeof fetch>();
  await expect(sendViewmodelPixels({ ...raster(), w }, 'https://bake.invalid/', send)).rejects.toThrow('dimensions');
  expect(send).not.toHaveBeenCalled();
});

test('validates all plane lengths and storage before beginning the first upload', async () => {
  const send = vi.fn<typeof fetch>();
  for (const arm of [new Uint8Array(3), new Uint8Array(new SharedArrayBuffer(4))]) {
    await expect(sendViewmodelPixels({ ...raster(), arm }, 'https://bake.invalid/', send)).rejects.toThrow('plane');
  }
  expect(send).not.toHaveBeenCalled();
});

test('rejects transport failures and never uploads later planes after refusal', async () => {
  const send = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 400 })));
  await expect(sendViewmodelPixels(raster(), 'https://bake.invalid/', send)).rejects.toThrow('handoff refused');
  expect(send).toHaveBeenCalledOnce(); send.mockClear(); send.mockRejectedValueOnce(new Error('transport failed'));
  await expect(sendViewmodelPixels(raster(), 'https://bake.invalid/', send)).rejects.toThrow('transport failed');
  expect(send).toHaveBeenCalledOnce();
});
