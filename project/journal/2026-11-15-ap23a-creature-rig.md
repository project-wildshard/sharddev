# AP23a: a creature rig from a three.js Group (opus-ss16c)

- `creatureGlb(group, { clips })` in `scene/creature.ts` (`@wildshard/sdk/scene/creature`): the group and its named
  non-mesh nodes are bones at their rest positions; each mesh binds rigidly to its nearest bone; clips keep their names.
  Built on `bake/skinned.ts` `skinnedGlb`. A bone resting rotated or scaled is refused (the bind pose is translations).
- Not yet wired into the build (`world.creature`, skin rows): AP23b.
