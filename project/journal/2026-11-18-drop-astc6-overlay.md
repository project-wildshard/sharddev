# 2026-11-18: the hand-made ASTC 6x6 overlay leaves (S12f4)

Meta SHARD-SOURCE S12f4. Engine's cook writes every phone 6x6 file now
(S12d, S12f1, S12f2): table rows, glTF prop maps and the splat ground's
product-blob layers. Pine was the last shard with a hand-made `astc6/`
folder, and it drops it in the same row.

So the sdk's hand tools go too: `bootInventory.ts` `phoneOverlayRows`
(no caller left), `scripts/bake-astc6.mjs` with its list and three
caches, and `scripts/astc6-phone-cap.mjs`, which trimmed the bake's
files to 512. One way to make a phone texture is left: the cook.
