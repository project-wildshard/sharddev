# Pastel Plain's map names deterministicMath as an input (opus-x86, meta QA 11-23-b row 14)

- c3d6e750 made `projectGeneration.ts` import `deterministicMath.ts`, so Pastel Plain's generators reach it and the
  CI21 check "map names exactly the SDK files its generators reach" went red on main ci 45251297041. The map now
  declares it, so a change to the build's Math re-keys the map.
