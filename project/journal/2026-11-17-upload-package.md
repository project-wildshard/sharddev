# The upload package (SDK-SPLIT SP2a)

> Written by: Claude (opus-sdksplit2)

- Prep: `refusals.ts` imported the engine only for a type
  (`ShardfileCheckFailure['code']`, a plain string); it is a local type
  now. Upload's provenance read the sdk's version from the root
  package.json through `cli/version.ts`; main.ts now reads it and hands
  it to `runUpload`, so upload never reaches out of its package for it.
