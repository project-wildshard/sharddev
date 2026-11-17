# New repos lint from the first check

TEMPLATE-E2E TC-NE4 (NEW-SHARD-E2E F4, found on the Mac mini): an
untouched `wildshard new` repo's `check .` skipped lint, because the repo
had no `.oxlintrc.author.json` and the published sdk shipped neither its
own config nor oxlint.

`new` now writes the sdk's config with its plugin paths under
`node_modules/@wildshard/sdk/lint/` and the Template's `src/shards/*/`
globs at `src/`; the sdk ships the config and lists oxlint as a
dependency, which `authorLintPlan` already looks for beside the sdk.

Turning lint on found two starter faults: the reference's
`shard.config.ts` held the identity merge as a runtime function
(`no-shard-runtime`), now `generators/identity.ts`, and `--empty` kept
TypeScript in `data/`, now `generators/card.ts` and
`generators/product.ts`.

Found next, for TC-NE5: `wildshard prove` on the untouched reference
fails at load with `Import signature outside ABI` (a behaviour script
admitted under the decision ABI), and on `--empty` an idle tape fails
`traveler pose changed on restore`.

## Report warnings name themselves (TC-NE6)

`check`'s report step counted its warnings ("6 warnings") and printed
none. Each now prints with the cap, the number and its limit, under the
new `budget-report-only` row: provisional tile-download caps and
tradeable resident targets warn and never refuse until they are
measured on phones. GUIDE.md `#budget-report-only` says so, and that
the untouched reference sits over about six of them.

## From the reference to a scene shard (TC-NE15)

GUIDE.md 2b now says which files a scene shard keeps: `shard.config.ts`
and what it imports. Followed on a fresh `new` repo (65 files under
`src/`): every file but `shard.config.ts` deleted, the GUIDE's meadow
written in, and `wildshard build` built it.

## Driving a dev page from a script (TC-NE24)

GUIDE.md "Walking your shard" now says how a script unlocks
`__wildshard.pose`, `nav.path` and `combat.*`: set
`window.__wildshardHarness = { seed: 1, capture: null }` in an init
script. Proved on a local `wildshard dev` page of shard-brasscap:
without the pins both calls refuse; with them pose lands at (3, -38) and
`combat.target('wyrmling', ...)` returns a live one. A creature's `brain`
in `state()` is the page's copy and reads `idle` while the server's brain
chases; the GUIDE says so, and reporting the server's state is engine
work (TEMPLATE-E2E TC-NE24b).

## Hosted CI caught two installed-sdk cases

`test/ci/installed-author.test.mjs` (packed sdk, app outside any git
checkout) went red: its author repo has the new config but its
packages sit one folder up, so the plugins could not load and oxlint
stopped with no report; and a missing source fell back to the sdk's own
config, which an installed sdk now ships. `authorLintPlan` now skips,
naming `pnpm install`, when a repo config's plugins are not installed
beside it; skips a missing source; and runs the sdk's own config only
from a checkout (engine under its node_modules). `lintOutcome` quotes
what oxlint said when it gives no report. Locally the test had passed
only because the scratch sat in a git-ignored folder, where oxlint
finds nothing to lint.
