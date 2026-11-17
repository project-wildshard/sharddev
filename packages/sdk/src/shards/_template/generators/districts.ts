import { Kit, framed } from './kit';

/**
 * Build-time only (SHARD-PLATFORM SF52, G220 pass 2): the districts that fill the flat plane between Template 1's roads,
 * the second set piece at each entry, and the four copy plots. Jake on the first fill: "needs much more" (no view from the
 * road or the air may read as an empty plane). Each quadrant has a corner district (≈ 105 m square, beyond the hub
 * corners) and two side strips between the spokes and the corner; one strip carries a district, the other a copy plot
 * (a 40 m pad a grid copy fills with its own landmark, `copyIdentity.ts`; in the solo template it stays a marked pad).
 * Nothing is mirrored: every district is its own dev-map vocabulary (measure boxes, panels, gantries, pads, ramps,
 * decks). Spokes (|x| or |z| < 10), the loop band, the hub corners, the entry set pieces and the sockets stay clear, and
 * nothing stands within 10 m of the cell edge. North is +z.
 */

/** the copy plots' centres (cell-local metres) and their half-size: one per quadrant, rotating round the cell */
export const COPY_PLOTS: readonly (readonly [number, number])[] = [[66, 162], [-162, 66], [-66, -162], [162, -66]];
export const PLOT_HALF = 20;

/** North-east corner: the hover test course. Kickers, a funbox, a quarter wall, a gap jump and a rail, on a marked pad. */
export function testCourse(): Kit {
  const kit = new Kit(), cx = 182, cz = 182;
  for (const dx of [-25, 25]) for (const dz of [-25, 25]) kit.box(cx + dx, 0, cz + dz, 49.6, 0.05, 49.6, 2, false);
  // the funbox: a 12 m deck 1.5 m up with a ramp on each side
  kit.box(cx, 0, cz, 12, 1.5, 12, 1, true);
  kit.ramp(cx - 13, 0, cz, 8, 7, 1.5, '+x'); kit.ramp(cx + 13, 0, cz, 8, 7, 1.5, '-x');
  kit.ramp(cx, 0, cz - 13, 8, 7, 1.5, '+z'); kit.ramp(cx, 0, cz + 13, 8, 7, 1.5, '-z');
  // kickers, each facing its own way
  kit.ramp(150, 0, 150, 5, 5, 1.2, '+x'); kit.ramp(214, 0, 152, 5, 5, 1.6, '+z'); kit.ramp(150, 0, 214, 5, 6, 1, '-z');
  // the gap jump: a launch, a 5 m gap and a landing deck with its run-out
  kit.ramp(140, 0, 196, 6, 9, 2.4, '+x');
  kit.box(159, 0, 196, 10, 2.4, 6, 1, true); kit.ramp(164, 2.4, 196, 6, 9, -2.4, '+x');
  // the quarter wall: three stacked slopes against a 6 m wall
  kit.box(230, 0, 196, 2, 6, 30, 1, true);
  kit.ramp(220, 0, 196, 30, 4, 1.2, '+x'); kit.ramp(224, 1.2, 196, 30, 3, 2, '+x'); kit.ramp(227, 3.2, 196, 30, 2, 2.6, '+x');
  // the rail ledge and the start gantry with its board
  kit.box(196, 0, 140, 24, 0.6, 1, 2, true, 'metal');
  for (const x of [168, 184]) kit.box(x, 0, 230, 1, 8, 1, 2, true, 'metal');
  kit.box(176, 8, 230, 18, 2.5, 1, 1, false);
  // course cones (marker blocks) on the infield
  for (let i = 0; i < 6; i++) kit.box(150 + i * 12, 0, 160, 0.8, 0.9, 0.8, 1, true);
  return kit;
}

/** North-west corner: the block district. A 4 × 4 grid of 18 m blocks, 6–30 m tall, with 8 m alleys you can ride through. */
export function blockDistrict(): Kit {
  const kit = new Kit(), heights = [12, 24, 8, 18, 30, 10, 16, 6, 9, 20, 27, 14, 18, 7, 12, 22];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = -226 + i * 26 + 9, z = 134 + j * 26 + 9, h = heights[i * 4 + j] ?? 10;
    kit.box(x, 0, z, 18, h, 18, 1, true);
    kit.box(x, h, z, 19, 0.5, 19, 2, false);
    // setbacks on the tall ones, rooftop plant on the rest
    if (h >= 18) { kit.box(x, h + 0.5, z, 11, h * 0.35, 11, 1, true); kit.box(x, h * 1.35 + 0.5, z, 12, 0.5, 12, 2, false); }
    else kit.box(x + 4, h + 0.5, z - 4, 4, 2, 3, 2, false);
    // ground-floor awnings facing the alley to the east
    kit.box(x + 9.75, 3, z, 1.5, 0.3, 10, 2, false);
  }
  return kit;
}

/** South-east corner: the ziggurat. Five 3 m tiers with a ramp up each (rotating round the sides) and a beacon mast on top. */
export function ziggurat(): Kit {
  const kit = new Kit(), cx = 182, cz = -182;
  const climbs = ['+z', '+x', '-z', '-x'] as const;
  for (let t = 0; t < 5; t++) {
    const size = 60 - t * 12, y0 = t * 3;
    kit.box(cx, y0, cz, size, 3, size, t % 2 === 0 ? 1 : 2, true);
    if (t === 4) break;
    // a ramp onto the tier from the one below, against its face (rideable all the way up)
    const climb = climbs[t % 4] ?? '+z', half = size / 2, next = (size - 12) / 2;
    if (climb === '+z') kit.ramp(cx - next + 4, y0 + 3, cz - half + 0.5, 5, 5.5, 3, '+z');
    else if (climb === '+x') kit.ramp(cx - half + 0.5, y0 + 3, cz + next - 4, 5, 5.5, 3, '+x');
    else if (climb === '-z') kit.ramp(cx + next - 4, y0 + 3, cz + half - 0.5, 5, 5.5, 3, '-z');
    else kit.ramp(cx + half - 0.5, y0 + 3, cz - next + 4, 5, 5.5, 3, '-x');
  }
  // the ground ramp onto tier one, from the north
  kit.ramp(cx, 0, cz + 42, 8, 12, 3, '-z');
  kit.box(cx, 15, cz, 2, 14, 2, 1, true, 'metal');
  kit.box(cx, 29, cz, 4, 2, 4, 2, false);
  for (const [dx, dz] of [[-36, -36], [36, -36], [36, 36], [-36, 36]] as const) kit.box(cx + dx, 0, cz + dz, 1, 6, 1, 2, true, 'metal');
  return kit;
}

/** South-west corner: the overpass. An L of elevated road 6 m up on columns, a ramp at each end and a control tower in the angle. */
export function overpass(): Kit {
  const kit = new Kit(), y = 6, z0 = -222, x0 = -222;
  // the deck: along x at z0 from x −217 to −140, and along z at x0 from z −217 to −140 (three 25.7 m spans each), meeting
  // the corner square
  const spans = [-204.1667, -178.5, -152.8333], span = 77 / 3;
  for (const c of spans) { kit.box(c, y, z0, span, 0.6, 10, 2, true); kit.box(x0, y, c, 10, 0.6, span, 2, true); } kit.box(x0, y, z0, 10, 0.6, 10, 2, true);
  for (const s of [-1, 1]) for (const c of spans) { kit.box(c, y + 0.6, z0 + s * 4.75, span, 0.9, 0.5, 1, true); kit.box(x0 + s * 4.75, y + 0.6, c, 0.5, 0.9, span, 1, true); }
  for (let k = 0; k < 5; k++) { kit.box(-200 + k * 14, 0, z0, 1.2, y, 1.2, 1, true); kit.box(x0, 0, -200 + k * 14, 1.2, y, 1.2, 1, true); }
  kit.box(x0, 0, z0, 2, y, 2, 1, true);
  // the ramps up at both free ends (climbing toward the deck)
  kit.ramp(-110, 0, z0, 10, 30, y + 0.3, '-x'); kit.ramp(x0, 0, -110, 10, 30, y + 0.3, '-z');
  // the control tower inside the angle, with its cab
  kit.box(-196, 0, -196, 6, 18, 6, 1, true); kit.box(-196, 18, -196, 9, 4, 9, 2, true); kit.box(-196, 22, -196, 10, 0.5, 10, 1, false);
  // a hangar-style shed under the long arm and stacked barriers along the ground road
  kit.box(-156, 0, -206, 20, 4, 10, 1, true);
  for (let k = 0; k < 8; k++) kit.box(-206 + k * 8, 0, -186, 3, 1, 1, 2, true);
  return kit;
}

/** North-east east strip: the scaffold yard. Six frames with decks at 4 m and 8 m, a ramp onto the low deck. */
export function scaffoldYard(): Kit {
  const kit = new Kit();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const x = 140 + i * 18, z = 50 + j * 36;
    for (const dx of [-6, 6]) for (const dz of [-6, 6]) kit.box(x + dx, 0, z + dz, 0.4, (i + j) % 2 === 0 ? 12 : 8, 0.4, 2, true, 'metal');
    kit.box(x, 4, z, 12.4, 0.3, 12.4, 1, true, 'wood');
    kit.box(x, 8, z, 12.4, 0.3, 12.4, (i + j) % 2 === 0 ? 1 : 2, true, 'wood');
    if ((i + j) % 2 === 0) kit.box(x, 12, z, 13, 0.4, 13, 2, false);
  }
  kit.ramp(140, 0, 31.8, 8, 12, 4.3, '+z');
  kit.box(176, 0, 100, 10, 3, 6, 1, true); kit.box(176, 3, 100, 11, 0.3, 7, 2, false);
  return kit;
}

/** North-west north strip: the billboard row. Five big boards on legs facing the north road, a bus shelter and benches. */
export function billboardRow(): Kit {
  const kit = new Kit();
  for (let k = 0; k < 5; k++) {
    const x = -118 + k * 18, h = 6 + (k % 3) * 3;
    kit.box(x - 4, 0, 168 + (k % 2) * 12, 0.6, h, 0.6, 2, true, 'metal'); kit.box(x + 4, 0, 168 + (k % 2) * 12, 0.6, h, 0.6, 2, true, 'metal');
    kit.box(x, h, 168 + (k % 2) * 12, 14, 6, 0.6, 1, false); kit.box(x, h + 6, 168 + (k % 2) * 12, 14.6, 0.4, 1.2, 2, false);
  }
  kit.box(-40, 0, 140, 12, 0.2, 3, 2, false); kit.box(-40, 3, 140, 13, 0.3, 4, 1, false);
  for (const x of [-46, -34]) kit.box(x, 0, 141.5, 0.3, 3, 0.3, 2, true, 'metal');
  for (const x of [-44, -40, -36]) kit.box(x, 0, 141, 2.4, 0.5, 0.8, 2, true, 'wood');
  return kit;
}

/** South-west west strip: the hangars. Two open-fronted sheds facing the west road's verge, with a taxi pad between. */
export function hangars(): Kit {
  const kit = new Kit();
  for (const z of [-52, -100]) {
    const x = -165, w = 30, d = 22, h = 12;
    kit.box(x - w / 2, 0, z, 0.8, h, d, 1, true); // the back wall, west
    kit.box(x, 0, z - d / 2, w, h, 0.8, 1, true); kit.box(x, 0, z + d / 2, w, h, 0.8, 1, true);
    kit.box(x, h, z, w + 1, 1, d + 1, 2, false);
    kit.box(x - 4, 0, z, 10, 2.2, 8, 2, true, 'metal');
  }
  kit.box(-160, 0, -76, 24, 0.05, 20, 2, false);
  kit.box(-140, 0, -76, 1, 10, 1, 2, true, 'metal'); kit.box(-140, 10, -76, 1.5, 3, 1.5, 1, false);
  return kit;
}

/** South-east south strip: the crate yard. Rows of 2 m crates in stacks of one to three, a forklift block and a weighbridge. */
export function crateYard(): Kit {
  const kit = new Kit(), stacks = [1, 3, 2, 1, 2, 3, 1, 2, 2, 1, 3, 1];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
    const high = stacks[i * 2 + j] ?? 1, x = 20 + i * 12, z = -140 - j * 22;
    for (let k = 0; k < high; k++) for (const dx of [0, 2.2]) kit.box(x + dx, k * 2, z, 2, 2, 2, k % 2 === 0 ? 1 : 2, true, 'wood');
  }
  kit.box(100, 0, -150, 3, 2.5, 5, 1, true, 'metal'); kit.box(100, 2.5, -151, 2.5, 1.8, 2, 2, false);
  kit.box(100, 0, -178, 10, 0.4, 18, 2, true, 'metal');
  kit.box(108, 0, -186, 3, 3, 3, 1, true);
  return kit;
}

/** The halves of the plot strips the copy plot leaves: measure cubes, a car park, an antenna row and a tank pair. */
export function stripFill(): Kit {
  const kit = new Kit();
  // NE north strip, east of the plot: the measure-cube scale set (1 to 5 m)
  for (let i = 0; i < 5; i++) kit.box(100 + (i % 2) * 10, 0, 140 + i * 11, i + 1, i + 1, i + 1, i % 2 === 0 ? 1 : 2, true);
  // NW west strip, north of the plot: the car park (bays, cars, a booth)
  kit.box(-162, 0, 106, 50, 0.05, 22, 2, false);
  for (let k = 0; k < 8; k++) for (const dz of [-6, 6]) if ((k + (dz > 0 ? 1 : 0)) % 3 !== 0) kit.box(-183 + k * 6, 0, 106 + dz, 2, 1.5, 4.5, 1, true, 'metal');
  kit.box(-134, 0, 106, 3, 3, 3, 1, true); kit.box(-134, 3, 106, 3.6, 0.3, 3.6, 2, false);
  // SW south strip, west of the plot: the antenna row (masts with dish blocks)
  for (let k = 0; k < 4; k++) { const x = -112 + (k % 2) * 8, z = -140 - k * 14, h = 10 + (k % 3) * 4; kit.box(x, 0, z, 0.6, h, 0.6, 2, true, 'metal'); kit.box(x, h - 2, z + 1, 3, 3, 0.6, 1, false); }
  // SE east strip, south of the plot: two tanks with a catwalk and a pipe run on supports
  for (const x of [148, 172]) { kit.box(x, 0, -106, 12, 8, 12, 1, true, 'metal'); kit.box(x, 8, -106, 12.6, 0.4, 12.6, 2, false); }
  kit.box(160, 8, -106, 12, 0.3, 2, 2, true, 'metal');
  kit.box(160, 3, -94, 40, 0.6, 0.6, 2, false); for (const x of [142, 160, 178]) kit.box(x, 0, -94, 0.5, 3, 0.5, 2, true, 'metal');
  return kit;
}

/** The four copy plots: a 40 m pad, its striped border and a corner post each (a grid copy stands its landmark on it). */
export function copyPlots(): Kit {
  const kit = new Kit(), s = PLOT_HALF;
  for (const [x, z] of COPY_PLOTS) {
    kit.box(x, 0, z, 2 * s, 0.08, 2 * s, 2, false);
    kit.detail = true;
    for (const side of [-1, 1]) { kit.box(x + side * (s - 0.5), 0.08, z, 1, 0.04, 2 * s, 1, false); kit.box(x, 0.08, z + side * (s - 0.5), 2 * s - 2, 0.04, 1, 1, false); }
    kit.detail = false;
    kit.box(x - s, 0, z - s, 0.5, 3, 0.5, 1, true, 'metal');
  }
  return kit;
}

/** Each entry's second set piece, further in than the first and each its own: a plaza, a weighbridge, a helipad, a car wash. */
export function entryExtras(): Kit {
  const kit = new Kit();
  // north: a stepped plaza with flag masts, off the road's right as you drive in
  const n = framed(kit, 'north');
  n(26, 0, 70, 20, 0.6, 20, 2, true); n(26, 0.6, 70, 14, 0.6, 14, 1, true); n(26, 1.2, 70, 8, 0.6, 8, 2, true);
  for (const inward of [58, 82]) n(14, 0, inward, 0.4, 10, 0.4, 2, true, 'metal');
  n(14, 8, 58, 0.2, 2, 3, 1, false); n(14, 8, 82, 0.2, 2, 3, 1, false);
  n(-24, 0, 66, 10, 5, 8, 1, true); n(-24, 5, 66, 11, 0.4, 9, 2, false);
  // south: the weighbridge office and a line of barrier blocks on the left
  const s = framed(kit, 'south');
  s(-22, 0, 66, 12, 6, 8, 1, true); s(-22, 6, 66, 13, 0.4, 9, 2, false); s(-15.5, 2.5, 66, 1, 0.3, 6, 2, false);
  for (let k = 0; k < 5; k++) s(-14, 0, 80 + k * 4, 1, 1, 2.5, 2, true);
  s(26, 0, 72, 16, 3, 3, 1, true);
  // east: a helipad on a deck with a ramp, and a windsock mast
  const e = framed(kit, 'east');
  e(26, 0, 70, 18, 2, 18, 2, true); e(26, 2, 70, 12, 0.1, 12, 1, false);
  kit.ramp(250 - 70, 0, 26 - 9 - 8, 6, 8, 2, '+z');
  e(-22, 0, 64, 0.4, 9, 0.4, 2, true, 'metal'); e(-22, 8, 65.5, 0.6, 0.6, 3, 1, false);
  // west: a car-wash gantry over a side bay and a row of vending blocks
  const w = framed(kit, 'west');
  for (const inward of [62, 74]) { w(18, 0, inward, 1, 5, 1, 2, true, 'metal'); w(30, 0, inward, 1, 5, 1, 2, true, 'metal'); w(24, 5, inward, 13, 1.2, 1.2, 1, false); }
  w(24, 0, 68, 10, 0.05, 20, 2, false);
  for (let k = 0; k < 4; k++) w(-16 - k * 2.5, 0, 64, 1.8, 2.2, 1.2, k % 2 === 0 ? 1 : 2, true);
  return kit;
}
