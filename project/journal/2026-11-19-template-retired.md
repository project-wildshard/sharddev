# The legacy Template leaves sharddev (2026-11-19)

> Written by: Claude (opus-tr8b, opus-tr11)

Meta TEMPLATE-E2E TR-11, Jake J434: "Delete the old legacy template & template-blender stuff. Mosscap & brasscap are the
NEW TEMPLATES." TR-12a and TR-12b had already moved the Template's gameplay, creatures and the Warden onto Mossgate, so
`src/shards/_template` and the files only it used go.

Coverage moved rather than went. The chest and Warden proofs, the boss decision test (now
`dev/test/scripts/mossgate-warden.test.ts`, recorded in `ci21-sdk-tail.json` as a rename) and the two CI21 source ports
(`mossgate-generation`, `mossgate-source-layout`) run on Mossgate with their original case titles. The template walk,
the 1800-tick journey, the determinism bake and the cooked play proof take Mossgate too: it is a source shard
`build:shards` does not list, so CI builds it on its own and hands it over with `WS_MOSSGATE_OUT`. Tests that only
borrowed the Template's data (combat source, runtime declaration) read Pastel Plain's. What went for good: pins that
bounded only the retired bake (its gameplay digest and map pixels) and the orphaned SF23 far board, whose imports had not
resolved since the split.
