import { parseWeaponProfile } from '@wildshard/format/weaponProfiles';

/** Small bounded profiles for a Template-style equipment catalogue; native families own contacts and views. */
export function weaponsExample() {
  return [
    parseWeaponProfile({ family: 'melee', damage: 10, reach: 2, swingScale: 1, cooldown: 0.4,
      comboGap: 0.5, chainLag: 0.1, heavyCharge: 0.6,
      moves: { combo: [{ windup: 0.1, slashEnd: 0.2, total: 0.4, damage: 1 }], heavy: { windup: 0.2, slashEnd: 0.4, total: 0.7, damage: 2 } },
      lunge: { range: 3, heavyRange: 4, cone: 1, stop: 1, speed: 4, minTime: 0.1, maxTime: 0.4 },
      sweep: { rays: 3, extensions: [1], step: 0.1, maxSamples: 16, maxHits: 8 } }),
    parseWeaponProfile({ family: 'bow', quiver: 24, speedBase: 30, speedDraw: 28, damageScale: 1.2,
      draw: { drawTime: 0.8, letdownTime: 0.2, renockTime: 0.6, renockEarly: 0.5, holdSteady: 1, holdTire: 3, tiredTime: 1 },
      spread: { degrees: 1, radius: 'sqrt', axisScale: 1, aimMultiplier: 0.5, motion: 1 },
      flight: { gravity: 9.8, drag: 0.01, windCoupling: 1 }, muzzle: 0.5, pool: 32, substeps: 4, lifetime: 10 }),
    parseWeaponProfile({ family: 'firearm', action: 'semi', magazine: 6, reserve: 24, interval: 0.3,
      reload: 1.5, reloadMode: 'magazine', autoReload: 0, damageScale: 1, range: 80,
      spreadAds: 0.5, spreadHip: 3, spreadRadius: 'sqrt', bloomShot: 0.2, bloomMax: 2, movingSpread: 1, movingAimReduction: 0.5,
      projectile: { kind: 'bullet', delivery: 'hitscan', speed: 100, radius: 0.01,
        flight: { gravity: 0, drag: 0, windCoupling: 0 }, pool: 16, substeps: 1, lifetime: 1 } }),
    parseWeaponProfile({ family: 'thrown', speed: 20, gravity: 9.8, damage: 20, headMultiplier: 2,
      radius: 0.1, headOffset: 0.2, windup: 0.2, release: 0.1, recovery: 0.5,
      carried: 3, pool: 8, pickupRadius: 1, pickupHeight: 1, survive: 1, arcPoints: 8, arcAfter: 0.2, stagger: 1 }),
  ];
}
