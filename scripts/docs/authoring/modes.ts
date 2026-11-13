import { Scene, Vector3 } from 'three';
import { Zipline, Updraft, Mount, Grapple } from '@wildshard/sdk/modes';
import { readScene } from '@wildshard/sdk/scene';
import { parseModes } from '@wildshard/format/modes';

/** Template-sized demonstration of all four control declarations; it grants no mount or anchors. */
export function modesExample() {
  const scene = new Scene();
  const cable = new Zipline(new Vector3(0, 8, 0), new Vector3(12, 0, 0)); cable.name = 'template.cable';
  const wind = new Updraft(new Vector3(0, 0, 0), new Vector3(0, 10, 8), { width: 3, lift: 5 }); wind.name = 'template.wind';
  const mount = new Mount({ walk: 2, trot: 4, canter: 7, gallop: 10 }); mount.name = 'template.ride';
  const grapple = new Grapple(); grapple.name = 'template.grapple';
  scene.add(cable, wind, mount, grapple);
  const data = readScene(scene);
  if (data.modes === undefined) throw new Error('Missing authored mode rows');
  return { rows: parseModes(data.modes), scene: data };
}
