/**
 * Build-time only: the template's far proxy look (SHARD-PLATFORM SF23), read by the far baker
 * (scripts/bake/far-proxies.mjs): the greybox ground faceted in the toon kit's flat greys, the pool (bed −3) a slate blue.
 */
export const farLook = {
  family: 'toon',
  colourAt: (x: number, z: number, h: number): [number, number, number] => {
    if (h < -1) return [0.12, 0.2, 0.28];
    const k = 0.94 + 0.06 * Math.sin(x * 0.05) * Math.cos(z * 0.05);
    return [0.36 * k, 0.4 * k, 0.36 * k];
  },
  // G222: its exposed boundary is a darker grey of its own ground (a new shard declares its own rock)
  cliff: { lip: [0.3, 0.32, 0.3], foot: [0.2, 0.21, 0.2] },
  haze: { colour: [0.6, 0.65, 0.7] },
} as const;
