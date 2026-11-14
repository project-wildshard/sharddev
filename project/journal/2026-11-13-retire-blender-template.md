# 2026-11-13: `new --template blender` retired (SS5, J341)

Meta SHARD-SOURCE SS5. Jake's J341 settles what a shard is: TypeScript three.js
scene source, with Blender making the `.glb` models that code loads. The
hand-written template (J314's `blender-template`, a shard file folder held by
hand) taught the other way, so `new` stops offering it.

- `TEMPLATES` is `['sdk']`. `templateNamed('blender')` throws
  `new: --template blender is retired (J341): ...`, before anything is written;
  an unknown name now says to leave out `--template` or pass `sdk`. Both read as
  the `new-template` refusal, whose fix names scene source.
- Supported, not taught: `writeShardRepo` still lays out the old shape
  (`RepoShape = TemplateName | 'blender'`), so the test that an old blender repo
  settles, checks and refuses `build` keeps running. `check`, `update --pins`
  and the hand-written source detection are untouched.
- GUIDE: the `new` row, the section 2 paragraph (now "Blender makes models, not
  shards") and the `new-template` refusal. Help text, the CLI usage string and
  the upgrade and mockup-to-model skills follow; the skills keep their notes
  for old blender repos, marked retired.
- No format change, so the live shard repos are not touched; they pick up the
  new GUIDE and skills with their next `wildshard update`.
