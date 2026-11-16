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
