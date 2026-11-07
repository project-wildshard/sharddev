/**
 * Build-time only: the pastel plain's far proxy look (SHARD-PLATFORM SF23, SF88e), read by the far baker
 * (scripts/bake/far-proxies.mjs): its own lilac ground (the `ground` graph's painterly preset, data/look.json) faceted in
 * the toon kit with a slow pink drift, the pool (bed −3) a lilac blue, under its pink fog.
 */
export const farLook = {
  family: 'toon',
  colourAt: (x: number, z: number, h: number): [number, number, number] => {
    if (h < -1) return [0.3, 0.3, 0.46];
    const k = 0.94 + 0.06 * Math.sin(x * 0.05) * Math.cos(z * 0.05), pink = 0.5 + 0.5 * Math.sin(x * 0.013 + z * 0.009);
    return [(0.5 + 0.04 * pink) * k, 0.42 * k, (0.58 - 0.03 * pink) * k];
  },
  // G222: its exposed boundary is a darker lilac of its own ground
  cliff: { lip: [0.42, 0.34, 0.48], foot: [0.28, 0.22, 0.32] },
  haze: { colour: [0.93, 0.84, 0.9] },
} as const;
