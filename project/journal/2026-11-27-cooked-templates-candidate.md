# 2026-11-27: cooked-templates tests the pinned engine, unhidden

- Meta QA69 (after Open Plots' QA68). The contract had been red since at
  least 11-25 behind `continue-on-error`: the producer check read the
  engine from `dependencies` (it is a devDependency since SDK-SPLIT), so
  `assert.ok(installed)` failed; it also admitted only `X.Y.Z` while the
  pin is npm next's `0.1.100-next.922b9d45`; and the candidate was a
  hand-typed 11-16 engine (9c487655) that lacks `./host/headlessFolder`.
- The candidate now defaults to the commit behind the sdk's engine pin
  (`src/scripts/pinned-engine-commit.mjs`), passed from the producer job
  to cook-play. `src/scripts/candidate-engine-source.mjs` is copied from
  shard-open-plots (PRODUCER_PIN, the lockfile source reader, the pin to
  commit lookup) and the assert script and proof read it.
- `select-candidate.mjs` replaces the engine edge where it is declared
  (devDependencies) instead of adding a second edge in `dependencies`.
- Both jobs drop `continue-on-error`.
