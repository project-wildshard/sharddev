# AP23a: a creature rig from a three.js Group (opus-ss16c)

- `creatureGlb(group, { clips })` in `scene/creature.ts` (`@wildshard/sdk/scene/creature`): the group and its named
  non-mesh nodes are bones at their rest positions; each mesh binds rigidly to its nearest bone; clips keep their names.
  Built on `bake/skinned.ts` `skinnedGlb`. A bone resting rotated or scaled is refused (the bind pose is translations).
- Not yet wired into the build (`world.creature`, skin rows): AP23b.

- AP23b: the group is the creature's frame, not a bone (bandit's root joint `body` stands at 0.62 m); a mesh under no
  bone is refused. `creatureSkin(rig, { id, binding })` writes the skin file's rig row and binding, the shape
  shard-brasscap's `bandit.skin.json` has; a bandit-shaped fixture matches its rig row (bones, joints, clips).

- AP24c: a `PointLight` under a bone rides it. `creatureGlb` returns `lamps` (bone, offset, linear colour, intensity,
  distance, decay) and `creatureLampRows(rig, actor)` writes them as `look.light.lamps` rows with
  `follow { actor, bone }` (shard-format v0.5.9). A light is never a bone; a light under no bone, a non-point light
  and a following lamp with no distance are refused.
