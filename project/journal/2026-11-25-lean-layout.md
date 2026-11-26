# sharddev moves to the lean layout (repo-kit A3, shard-lean-layout R1)

- The kit's scripts are src/scripts/.kit/, its tests src/test/.kit/;
  sharddev's own root scripts are src/scripts/, its own tooling tests
  src/test/. kit/ is gone: its lint config is .oxlintrc.kit.json at
  the root, its TypeScript options tsconfig.node.json (the packages
  extend it), and the packages' lint runner stays as sharddev's own
  src/scripts/lint.mjs. The verbs are the D33 set; land stays (L7).
- The packages keep their own scripts/: the mover read every
  scripts/ as the root's, so its package edits went back, and only
  real root paths (../../kit/scripts/x, a package.json's own) moved.
- Missed by the mover and re-pointed: escaped paths in three tests'
  regexes, and the pre-push gates (format-api-gate and
  retired-vocabulary sat behind [ -f ] checks that went false).
  retired-vocabulary keeps the same count over the same files:
  src/scripts/ and src/test/ stay out.
- Hooks move to hc with the kit: lib.mjs and check-index.mjs are the
  kit's at J370's 5 MB cap; run-checks skips a delete-only push of a
  shipped release/vX.Y.Z branch, as the kit's does, and names pnpm
  fix.
