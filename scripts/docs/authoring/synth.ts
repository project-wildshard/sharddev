import { Scene, Group } from 'three';
import { synthScene } from '@wildshard/sdk/synth';

/** Publish a Template-style graph into an existing author project directory. */
export function synthExample(project: string) {
  const scene = new Scene(), hall = new Group(); hall.name = 'template.hall'; scene.add(hall);
  return synthScene(scene, project, 'template-pilot');
}
