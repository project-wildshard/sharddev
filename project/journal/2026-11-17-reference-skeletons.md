# Reproducible reference skeletons

> Written by: Codex
> State: ONE-FORMAT CC10a2b1 source, 2026-11-17.

Kit now exposes referenceSkeletonSource through its skeletons subpath and
root. The defining format table supplies both complete hierarchies and
names; Kit supplies plain authored geometry with rigid skin weights.
The helper uses Three and format only, with caller-owned fresh geometry.
The build-time generator reuses the SDK skinnedGlb codec and writes the
small biped and quadruped assets under content/skeletons. No runtime
controller, clock or SDK host is introduced.

Both real GLBs regenerate exactly. Tests decode ordered joints, parents,
unit inverse binds, socket/default-volume bones and weighted primitives.
The packed Kit archive includes both GLBs and the public source subpath.
All22 Kit tests, full workspace types and author lint pass. Exact logs
are root tmp/codex-te2e/cc10a2b1-*. Source and hosted qualification are
recorded in the meta plan. Graphical judgment remains Needs Opus.

The scene/creature comment now describes the complete ordered skin joint
list already emitted by CC10a2a, rather than the removed pair layout.

The first full push caught generator lint outside the src-only staged
checks. Kit's TypeScript project now includes its Node build script;
parallel writes and an explicit filesystem boundary pass normal lint.
No gate is bypassed. The following fix commit contains only that repair.
