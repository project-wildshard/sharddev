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
- CP3: sharddev's pre-push refuses a main push moving the SDK family's
  @wildshard/format pin above the API's /api/format package (engine's gate,
  for the SDK repo); ALLOW_FORMAT_AHEAD=1 is the hatch.
- CP18 codemod (sdk 0.4.24): format/immutable's two helpers come from the
  sdk's immutable under the repo's sdk name; a repo with no engine import
  drops the engine pin and override. Tests: one-pin-codemod.test.ts.
- CP18 pins: check's lint step refuses a format or engine pin (or engine
  override) other than the installed SDK's (pinCheck.ts, rule pin-not-sdk);
  update --pins sets format to the SDK's pin either way (SP13's never-back
  rule retired). Format stays listed: the SDK's lint refuses re-exports.
- CP18 codemod fix: engine use is read from real import/require specifiers
  (TypeScript preProcessFile), skipping .githooks and fixtures (the mini's
  Mirror Salt pinned-links case).
