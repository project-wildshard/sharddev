import { makePixels, type SetName } from '@wildshard/engine/player/viewmodelTextures';
import { sendViewmodelPixels, type ViewmodelBake } from './viewmodelBytes';

declare global { interface Window { bakeViewmodelPixels: (name: SetName, byteUrl: string) => Promise<ViewmodelBake> } }
function canvas2d(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('no 2d context');
  return context;
}
window.bakeViewmodelPixels = (name, byteUrl) => sendViewmodelPixels(makePixels(name, canvas2d), byteUrl);
