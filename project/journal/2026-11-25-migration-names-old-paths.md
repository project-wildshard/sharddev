# The 0.5.0 migration names the old paths the roll fixed by hand

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25.

sdk-migrate F2. In the R3 roll, a scratch script
(`tmp/r3-roll/fixup.mjs`) rewrote paths that the 0.5.0 migration had
left behind in about 180 files. Done that way, an outside author would
never have seen them. The migration's manual scan now covers what that
script found:

- code under `src/` (it skipped all of `src/` before; it still skips
  each `static/` tree, the kit-stamped `.kit` folders and `kit/`);
- `public/assets/…` after `../` steps (`'../../../public/assets/x.glb'`
  in a generator or a map's scene pool);
- `public${url}`, `'public'` as a path segment or by its `.length`, and
  `/^public\//`;
- a quoted `"public/"` in an ignore list, and a `0\.4\.\d+` pin check;
- a build-output folder a test pins (`public/assets/<slug>/baked/…`,
  ignored, so absent from git);
- a map input naming `public/` that resolves outside the repo, which
  used to be skipped silently.

An `assetGlobs` list is blanked out before the scan, since its names
are mount names and never move.

To check it, `tmp/r3-roll/f2-verify.mjs` ran the codemod on each of the
11 pre-roll trees, then ran fixup, then listed every file fixup changed
that the manual list didn't name. The 11 left over are prose comments,
plus Driftwood's paths copied into two blender target lists. None of
them is a path that gets read.

Along the way, fixup turned out to edit Showcase's kit-stamped
`src/test/.kit/keep-copy.test.mjs` (only repo-kit should touch that),
and the check went red on it. Both fixup and the scan skip `.kit` now.
