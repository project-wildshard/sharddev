# Prove native builds from immutable archives

> Written by: Codex
> **State:** local proof passed, 2026-11-16; SDK hosted CI/delivery pending.

Immutable sources: Pine3ad4a7ff9a9bd75a44c8869c012e9318b28cbc4d and
Driftwoodcf353492e7ce960e0655d1694b459aebd6c9fd71. Both baseline builds
pass on npm SDK0.2.12, engine0.1.18 and format0.4.9. Isolated copies retain
their source, with only the approved kit import codemod.

Both sources build normally twice with separate fresh generation caches
from immutable SDK/kit/engine archives plus public npm format0.11.0.
These are local candidate archives, not published SDK/kit/engine releases.

| Source | Files per complete repeat | Unchanged geometry files | Unchanged actor sections |
|---|---:|---:|---:|
| Pine | 1,235 | 539 | 3 |
| Driftwood | 523 | 287 | 3 |

Complete manifests match across repeats. Original geometry hashes and
creatures/spawns/species sections match their immutable baselines. No
baseline file is removed. Five existing files change per product:
product inputs, index, validation and two declaration sections. Pine adds
seven catalogue images. Deltas copy harvest/cap/tuning, weapon debris and
original glyph content. No visual verdict is claimed.

Real packed builds exposed missing compiler inputs. SDK now ships its
defining kit/tsconfig.json; engine ships that parent and referenced
test/tsconfig.json. Archive gates validate compiler input closure. The
obsolete crawler development config stays out of the SDK archive. Fixed
packages compile without files added from a live checkout.

A real pnpm10.34.9 install uses strict peers and disables automatic peers.
Only the old SDK alias and kit are root dependencies; fixture file
overrides supply the unpublished candidate engine/kit. No canonical SDK
dependency or override is present. The installed package Template check
passes build/validate/report with zero refusals; handwritten lint and the
absent proof tape skip. No live engine/SDK aliases are used.

Full manifests and exact declaration changes remain under
tmp/codex-te2e/native-oracles. Hosted SDK CI and compatible declared engine
pin remain open. Initial kit bootstrap and staging delivery are OF14
under J373. Exact source and candidate archive identities:

```json
{
  "sdkSource": "60052afefcca566cc297c8902712f0dcb70cc4d2",
  "engineSource": "a874edf7c93f7fecd4b926bf2cfcec41598cd6c4",
  "format": "0.11.0",
  "archives": {
    "engine": "843cefce86e21978dd81798896290e3a3e6a6aef4cc46589702b4a53e913fa3e",
    "sdk": "e66d7fd56f0b2d8c29b009f1aecb8d55762066d8f3576e03c130f5c69397629d",
    "kit": "8e7a9e74f1d0c31ecd0e898aec68b4612599280365488e96844a75f73948f6eb"
  },
  "canonicalFormatDependency": "@wildshard/shard-format@0.11.0"
}
```

## Real native drop and save comparison

The same immutable baseline/candidate products also run through engine
M1 b270a039's real headless host and physics. Pine's boar and Driftwood's
crab retain identical pack payouts between old and new products. Each
pending save restores and pays once; consumed saves cannot pay again.
A pre-change product's pending save also restores on the new product
and pays the same pack, with no duplicate claim. Exact baseline and
candidate pending-save bytes are retained in engine tmp/codex-te2e,
with their hashes in native-archive-save-identities.json. The direct
branch proof script/result/log are native-archive-harvest.mjs,
native-archive-harvest-result.json and native-archive-harvest-direct.log.

These source-archive proofs do not claim published source pins or a
retired runtime table. Keep the old pending-save cases when removing
implicit content: old snapshots omit resolved drops, so their current
fallback must be replaced by admitted content before deleting tables.

## Final native motion replay

Engine cd0d73157d (resolved M1, normal land active) runs both immutable
old products and both final look-candidate products for 3,600 actual
world ticks. Every entity id, position, yaw, state, health and alive flag
is hashed at every tick; seven independent checkpoints also agree.
Pine sees164 bodies/11 moving; Driftwood sees34/10 moving. The player
follows the same four-phase movement input, with no random replacement.

Complete histories, equal before/after:

- Pine:0792f478f759805f98ed32e08b4232933f10a61a93aeb9eaffe251d1c303e835
- Driftwood:6eb005a36d73b0acb117a51e6562657746e36a00d8276ce9a7b18f74e3c3b370

Exact product and loaded source hashes, checkpoints and receipts stay
in engine tmp/codex-te2e/native-final-motion-*.json. Native source and
archive identities are the earlier fixed inputs in this journal and
native-look-bases.md. This proves simulation parity, not appearance.
