// The dune jackal in TypeScript: the kit's quadruped body, pursue temperament and bite, plus its own rows.
import { abilities } from '@wildshard/kit/abilities';
import { quadruped } from '@wildshard/kit/body';
import { temperament } from '@wildshard/kit/temperament';

const bite = abilities.bite({ id: 'jackal.bite', damage: 9, range: 1.6 });
const { temperament: pursue, senses } = temperament.pursue({ aggro: 16, leash: 30 });

export const jackal = {
  species: [{
    id: 'jackal', kind: 'jackal', label: 'Dune jackal', type: 'beast', aggressive: true, lockable: true,
    dims: { bodyY: 0.5, bodyHalfLen: 0.45, bodyRadius: 0.22, headRadius: 0.12, legLen: 0.42, feet: [], halfWidth: 0.18 },
    variants: [{ id: 'tawny', label: 'Tawny jackal', rarity: 'common', weight: 1, scale: [0.9, 1.1], hp: 40,
      mods: { speed: 1, chargeDist: 1, damageTaken: 1, chargeDamage: 0, relentless: false } }],
    body: quadruped({ look: 'jackal.look' }),
    temperament: pursue, senses, abilities: [bite.ability],
  }],
  strikes: [bite.strike],
  looks: [{ id: 'jackal.look', species: 'jackal', recipe: 'platform.skin', material: null, parameters: {},
    animation: { recipe: 'platform.clips', parameters: {} } }],
};
