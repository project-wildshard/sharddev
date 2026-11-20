// Meta MOSSGATE-ZONE MZ28: Mossgate's play proof, one player, end to end, as the MacBook's lane-scratch `moss.mjs` did:
// a census of what the shard holds against the full-zone bar, a grey blob killed for "The grey blobs", then the main
// chain "Relight the Hollow" (MZ18): the Lamplighter, braziers A, C and B, the Pond Hermit's rite at the Standing Stones,
// the Sunken Shrine and the Lookout beacon, the Quarrymaster over the bridge, the Barrow Warden on the Downs, and home.
// The two-player Warden win is `mossgate-warden-two.mjs` beside it (MZ30 runs both on staging).
// Run from packages/sdk, against a dev server (a fresh one: the dev world keeps lit braziers and spent quests):
//   node ../cli/bin/wildshard.mjs dev src/shards/mossgate 64021 &
//   node ../cli/bin/wildshard.mjs prove src/shards/mossgate ../dev/test/walk/mossgate.walk.mjs --base http://127.0.0.1:64021
// It logs one JSON line a stop and throws (a WalkProofError naming what the page showed) at the first step that fails.

/** The full-zone bar this proof checks the page's own rows against (meta MOSSGATE-ZONE "The bar"); `interactions` is the
 *  use prompts alone (11 on 11-19), where `wildshard content --bar templates` counts 13 interactables with the finds. */
const BAR = { spawns: 45, quests: 8, talks: 3, interactions: 10, triggers: 12 };

export default async function mossgate({ rows, walkTo, talk, choose, fight, expectFlags, expectQuest, state, page }) {
  const log = (what) => { console.log(JSON.stringify(what)); };
  const at = async (label) => { const s = await state(); log({ at: label, x: Math.round(s.x), z: Math.round(s.z), hp: s.hp }); };
  const use = async (id) => { await walkTo(id, 1.2); await page.keyboard.press('e'); await page.waitForTimeout(600); };
  const via = async (points, reach = 2.5) => { for (const point of points) await walkTo(point, reach); };
  // `fight` clears a whole species kind, and Mossgate's mosslings and wisps share the grey blob's kind: so close on the
  // nearest yard blob (walking turns the player to it) and swing until the server files the blob quest's death flag
  const oneBlob = async () => {
    const started = Date.now(); let swings = 0;
    while (Date.now() - started < 60_000) {
      const me = await state();
      if (me.flags.includes('mossgate.blob')) { log({ blob: { swings, ms: Date.now() - started } }); return; }
      const blobs = await page.evaluate(() => [...(globalThis.__workerClientRows?.('greyBlob') ?? [])].map(({ x, z }) => ({ x, z })));
      const near = blobs.filter((b) => Math.hypot(b.x - me.x, b.z - me.z) < 30).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
      if (near === undefined) throw new Error(`no grey blob within 30 m of (${Math.round(me.x)}, ${Math.round(me.z)})`);
      if (Math.hypot(near.x - me.x, near.z - me.z) > 2.2) { await walkTo(near, 1.8).catch(() => undefined); continue; }
      await page.mouse.move(200, 300); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); swings += 1;
      await page.waitForTimeout(240);
    }
    throw new Error('the grey blob still stands after 60 s');
  };

  // the census: what the page holds, against the bar
  const held = await rows(), census = {
    spawns: held.creatures.spawns.reduce((n, row) => n + (row.count ?? 1), 0), quests: held.quests.quests.length,
    talks: held.targets.talks?.length ?? 0, interactions: held.targets.interactions.length, triggers: held.quests.triggers.length,
  };
  log({ census, bar: BAR });
  const short = Object.entries(BAR).filter(([key, least]) => census[key] < least);
  if (short.length > 0) throw new Error(`census under the bar: ${short.map(([key, least]) => `${key} ${census[key]} < ${least}`).join(', ')}`);

  // the Lamplighter, then the three braziers
  await talk('mossgate.lamplighter.talk');
  await choose('accept');
  await expectQuest('mossgate.lamplighter', 'a');
  await use('mossgate.brazier-a.use');
  await use('mossgate.brazier-c.use');
  await via([{ x: 2, z: -2 }, { x: -6, z: 0 }, { x: -11.8, z: 0 }, { x: -12, z: 8 }, { x: -24, z: 8.5 }], 1.2);
  await use('mossgate.brazier-b.use');
  await expectFlags(['mossgate.lamp.a', 'mossgate.lamp.b', 'mossgate.lamp.c']);
  await expectQuest('mossgate.lamplighter', 'hermit');
  // the Pond Hermit: the old rite
  await talk('mossgate.hermit.talk');
  await choose('warden');
  await expectQuest('mossgate.lamplighter', 'stones');
  await at('hermit');
  // north past the yard's grey blobs (one falls: "The grey blobs"), round the den, to the Standing Stones
  await via([{ x: -12, z: 8 }, { x: -11.8, z: 0 }, { x: -6, z: 0 }, { x: 10.5, z: -2 }, { x: 14.5, z: -2 }, { x: 14.5, z: -12 }, { x: 13, z: -34 }]);
  await oneBlob();
  await at('blob');
  await via([{ x: 13, z: -34 }, { x: 10, z: -70 }, { x: 22, z: -130 }, { x: 36, z: -186 }]);
  await walkTo({ x: 40, z: -198 }, 2);
  await expectFlags(['mossgate.rite.stones']);
  await at('stones');
  // west and south to the Sunken Shrine
  await via([{ x: -10, z: -150 }, { x: -60, z: -110 }, { x: -100, z: -40 }, { x: -130, z: 10 }, { x: -151, z: 18 }]);
  await walkTo({ x: -156, z: 19 }, 1.5);
  await expectFlags(['mossgate.rite.shrine']);
  await at('shrine');
  // north-west up to the Lookout, onto the dais, the beacon
  await via([{ x: -150, z: -40 }, { x: -160, z: -120 }, { x: -170, z: -185 }, { x: -181, z: -198 }]);
  await walkTo({ x: -183.5, z: -200 }, 0.6);
  await walkTo({ x: -190.3, z: -200 }, 0.6);
  await page.keyboard.press('e'); await page.waitForTimeout(800);
  await expectFlags(['mossgate.rite.lookout', 'mossgate.beacon.lit']);
  await at('beacon');
  // down and south to the Old Quarry, over the bridge, to the Quarrymaster
  await walkTo({ x: -183.5, z: -200 }, 0.6);
  await via([{ x: -170, z: -190 }, { x: -110, z: -100 }, { x: -70, z: 60 }, { x: -10, z: 100 }, { x: 10, z: 120 }, { x: 17.6, z: 137.5 }, { x: 22.2, z: 147.9 }, { x: 25.8, z: 156.1 }], 1.5);
  await talk('mossgate.quarrymaster.talk');
  await choose('beacon');
  await expectFlags(['mossgate.quarrymaster.told']);
  await expectQuest('mossgate.lamplighter', 'warden');
  await at('quarrymaster');
  // back over the bridge along its deck, then north-east to the Downs and the Warden
  await via([{ x: 25.6, z: 155.7 }, { x: 22.2, z: 148 }, { x: 18.8, z: 140.2 }], 1);
  await via([{ x: 17.6, z: 137.5 }, { x: 10, z: 120 }, { x: 40, z: 70 }, { x: 100, z: 30 }, { x: 140.5, z: 45 }, { x: 149, z: 45 }, { x: 154, z: 45 }], 1.5);
  // MZ20 made the Warden a two-player boss (1800 hp, three phases, tells to dodge): one player who never dodges may fall
  // to it, so the walk counts the fight engaged and its blows landing, and goes home only after a win. The win with two
  // players dodging the tells is `mossgate-warden-two.mjs` beside this file.
  // its body leaves the field between phases, where `fight` stops (fighting again chases the Gritmaw kin elsewhere)
  const before = await state();
  await fight('barrow-warden').catch((error) => { log({ warden: { fight: String(error instanceof Error ? error.message : error).slice(0, 160) } }); });
  const after = await state();
  const won = after.flags.includes('dead:barrow-warden');
  log({ warden: { won, hp: [before.hp, after.hp] } });
  if (!won) { await at('warden-solo'); return; }
  await expectQuest('mossgate.lamplighter', 'report');
  await at('warden');
  // home to the Lamplighter
  await via([{ x: 149, z: 45 }, { x: 140.5, z: 45 }, { x: 100, z: 12 }, { x: 50, z: 0 }, { x: 17, z: -2 }, { x: 14.5, z: -2 }, { x: 10.5, z: -2 }]);
  await talk('mossgate.lamplighter.talk');
  await choose('report');
  await expectQuest('mossgate.lamplighter', 'complete');
  await at('done');
}
