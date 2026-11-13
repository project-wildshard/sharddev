# 2026-11-13: the hero pre-check takes the API's digest

> Written by: Claude (lane opus-herocheck)

- UP3's hero pre-check hashed `presentation.card` only, which only
  blender-template carries. `_template` and every shard `wildshard new`
  makes carry a `data:` card in `manifest.card` and no presentation card,
  so the pre-check never refused an unchanged hero there (meta
  SHARD-AUTHORING UP5 needs it to).
- `src/cli/upload/hero.ts` ports api-server's UP4 rule (`79f5ca1`,
  `src/server/shardfile/hero.ts`): manifest card first, else presentation
  card; a packed blob URL gives its hash, a `data:` URL is hashed whole.
  `validateShardfile` returns `heroHash`; `upload.ts` compares that.
- `hero-digest.test.ts` pins the digests api-server's own stream check
  gives for format v0.4.4's corpus (handwritten: packed card; Brasscap
  Mesa: `data:` card, `_template`'s shape). Checked by hand too: the built
  `_template` output digests to `85b46f8b…` on both sides.
- Follow-up: the function is now copied in two repos. Exporting it from
  shard-format would leave one copy. `upload.test.ts`'s own `heroDigest()`
  helper still hashes the presentation card the old way; it's correct for
  its fixture, but it should read `heroHash`.
