# `world.creature` (ONE-FORMAT CC24)

A scene source now writes a whole creature: `world.creature(id, group, options)` compiles a three.js `Group` of named
bones (built outside `world.scene`) to its skinned GLB rig and skin (AP23a/AP23b), stores both files (the skin in the
library) and adds the species row and its `<id>.look` skin look, with size, skeleton, volumes, lock and hits, under
CC47's 64-bone cap and the skin's 32 sockets. `wildshard content` lists each skinned creature's bones and triangles.
`SceneRefusalError` moved to `scene/refusal.ts` (new `@wildshard/sdk/scene/refusal` export) so the creature compilers
and the walker share it without an import cycle. Trail bones and a clip map wait for their format rows (CC23, CC24b).
