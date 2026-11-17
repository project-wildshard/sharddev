import * as v from 'valibot';
import { CreaturesSchema } from '@wildshard/format/creatures';
import { parseBossProfile } from '@wildshard/format/bossProfiles';

/** Template 1's actual pursuit row/spawn, plus a minimal held-body boss declaration. */
export function brainsExample() {
  const creatures = v.parse(CreaturesSchema, {
    brains: [{ id: 'blob-pursuit', kind: 'pursue', awareRadius: 12, leashRadius: 25, speed: 1, returnSpeed: 2,
      stopDistance: 1.5, turnRate: 4, thinkDivisor: 3, attackCooldownTicks: 60, wanderRadius: 4, wanderEveryTicks: 420 }],
    spawns: [{ id: 'grey-blob:1', species: 'grey-blob', variant: 'grey', brain: 'blob-pursuit', strike: null, seed: 435, scale: 1, at: [0, 0, -19], yaw: 0 }],
  });
  const boss = parseBossProfile({ kind: 'boss', pattern: 'held', fight: {
    arena: { x: -15, z: -20, r: 10, floor: 0 }, hpShares: [1, 0.5],
    rewardPoint: { x: -15, y: 0, z: -18 }, respawn: { x: -15, y: 0, z: -12, yaw: 0 },
  } });
  return { creatures, boss };
}
