import { quadruped } from '@wildshard/kit/body';
import { temperament } from '@wildshard/kit/temperament';

/** Each rebuild copies plain kit content; a shard may supply its own look. */
export function kitContentExample() {
  return {
    body: quadruped({ look: 'meadow.look.boar', size: 'medium', scale: 1 }),
    temperament: temperament.neutral(),
  };
}
