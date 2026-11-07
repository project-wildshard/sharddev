import { saveCanvasPng } from '@wildshard/engine/scripts/parity/canvas-bytes.mjs';

/** Retain colour/height snapshots locally; only map metadata crosses JSON.
 * @template {{colour:HTMLCanvasElement,height:HTMLCanvasElement|null}} T
 * @param {import('@wildshard/engine/scripts/bake-output.mjs').ByteSinkPage} page
 * @param {import('playwright').JSHandle<T>} handle
 * @param {string} colourFile
 * @param {string} heightFile
 * @returns {Promise<Omit<T,'colour'|'height'>&{hasHeight:boolean}>} */
export async function saveMapFrames(page, handle, colourFile, heightFile) {
  try {
    const metadata = await handle.evaluate(({ colour: _colour, height, ...rest }) => ({ ...rest, hasHeight: height !== null }));
    await saveCanvasPng(page, await handle.getProperty('colour'), colourFile);
    if (metadata.hasHeight) {
      const height = await handle.evaluateHandle(frame => {
        if (frame.height === null) throw new Error('Missing map height canvas');
        return frame.height;
      });
      await saveCanvasPng(page, height, heightFile);
    }
    return metadata;
  } finally { await handle.dispose(); }
}
