# SHARD-COMPAT (J486)

- CP18b: `@wildshard/dev/test/proof` (`openShardProof`, `nativeRapierFile`)
  boots a built folder for a shard's proofs from dev's engine pin: the
  boot every shard copied into its own test/fixtures, in one place.
- CP18b: `openShardSim` and `questLedger` join the harness: the declared
  simulation with its quest host, act-route claims and grants, for tapes
  like Mirror Salt's (salt-cup, salt-finds).
- CP18b: `@wildshard/dev/test/quest` (questFlags, authoredQuest,
  authoredQuestLine, npcLine) for folder-less quest-content tests;
  openShardSim returns its descriptor.
- CP18b: `@wildshard/dev/test/node` is the harness's Node entry
  (`node --import @wildshard/dev/test/node --test ...`): engine's loader for
  its TypeScript and the rapier package, which has no Node entry of its own.
