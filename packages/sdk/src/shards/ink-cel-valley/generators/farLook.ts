/**
 * Build-time only: the ink / cel valley's far proxy look (SHARD-PLATFORM SF23, SF88e), read by the far baker
 * (scripts/bake/far-proxies.mjs): its own sage ground (the `ground` graph's toon preset, data/look.ts) in flat cel bands
 * by height, the pool (bed −3) an ink-wash teal, under its teal-paper fog.
 */
export const farLook = {
  family: 'toon',
  colourAt: (_x: number, _z: number, h: number): [number, number, number] => {
    if (h < -1) return [0.16, 0.26, 0.26];
    const band = h > 6 ? 1.08 : h > 2 ? 1 : 0.92;
    return [0.38 * band, 0.42 * band, 0.25 * band];
  },
  // G222: its exposed boundary is the ink-wash shade of its own ground
  cliff: { lip: [0.26, 0.28, 0.2], foot: [0.14, 0.15, 0.12] },
  haze: { colour: [0.78, 0.82, 0.76] },
} as const;
