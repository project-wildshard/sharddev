# 2026-11-14: draws by material, not by tile (SHARD-SOURCE AP8)

> Written by: Claude (opus-ss4b)

- The engine (plan/ss4) merges static props and fine terrain per material per 250 m block; members still cast from the
  shadow-only layer. The authoring slice at the six proof cameras, desktop, whole frame (view + shadow + post):
  hut front 116 to 85, door lamp 113 to 80, hut back 170 to 123, pond 155 to 105, brazier 95 to 79, sky 198 to 150. Hut
  front's props draw 30 times in the view (the materials in sight), terrain 2 (was 26). Shots match the AP14 build (mean
  difference under 0.3 of 255).
- Phone tier, CPU slowed 4x, headless: 47 to 73 draws a frame, 30 fps; desktop 60 fps (headless, capped).
- `watch/proof.mjs --draws` measures it (`--throttle N` slows the CPU). The build log's tile caps flag triangles only:
  draws are a view's budget (format `VIEW_DRAWS`, shard-format 0.5.7's report).
