# Fenced reads ride as mounts (meta mini QA row 53)

- Nine's prepared product lacked `leaf-atlas.webp` and `dragon-hook.glb`.
  Its `mounts.json` lists only their GPU twins: the old monorepo
  recorder drops a source whose stand-in exists on both tiers, but
  Nine's phone tier runs `textures: 'img'` and reads the originals.
  The fence (`fence-reads.json`) names both, and the preparation
  client 404'd them and stalled at Files.
- `readCookInput` now mounts every fenced `asset:/assets/...` file the
  shard's own `public/` holds. Engine-hosted reads (music, shared sfx)
  are not on disk there and stay out. Only Nine gains files today (the
  two above); every other shard repo's fence is already covered.
