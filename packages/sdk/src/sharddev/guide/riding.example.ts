// A rideable dune camel: the kit's quadruped body and passive temperament, and a mount row with its four gaits.
import { quadruped, temperament } from '@wildshard/kit';

const { temperament: calm, senses } = temperament.passive();

export const camel = {
  species: [{
    id: 'camel', kind: 'camel', label: 'Dune camel', type: 'beast', aggressive: false, lockable: true,
    dims: { bodyY: 1.4, bodyHalfLen: 0.9, bodyRadius: 0.5, headRadius: 0.2, legLen: 1.1, feet: [], halfWidth: 0.45 },
    variants: [{ id: 'sand', label: 'Sand camel', rarity: 'common', weight: 1, scale: [0.95, 1.05], hp: 120,
      mods: { speed: 1, chargeDist: 1, damageTaken: 1, chargeDamage: 0, relentless: false } }],
    body: quadruped({ look: 'camel.look' }),
    temperament: calm, senses,
    mount: { gaits: { walk: 1.8, trot: 4.5, canter: 8.5, gallop: 13 } },
  }],
  looks: [{ id: 'camel.look', species: 'camel', recipe: 'platform.skin', material: null, parameters: {},
    animation: { recipe: 'platform.clips', parameters: {} } }],
};
