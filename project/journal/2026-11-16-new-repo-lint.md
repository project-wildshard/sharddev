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
