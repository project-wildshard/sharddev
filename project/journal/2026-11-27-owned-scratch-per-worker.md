# Each test worker keeps its own fixture folder (meta QA 11-26 row 34)

The push gate sets WS_LANE_NAME, so every vitest worker's fixtures shared
`packages/sdk/tmp/<lane>`. A worker whose fixtures were all gone removed
that folder in `closeFixtures`, while another worker was past its import
and about to make a fixture. That failed `authorBundle.test.ts` in a gate:
"ENOENT mkdtemp .../tmp/opus-sf22/node-author-XXXXXX".

Each worker now makes its fixtures in `worker-<pool id>-<pid>` under the
lane folder, and it removes only that folder. The shared folder goes only
when it is empty, and a worker makes it again if a sibling removed it.
`existed` now checks the folder scratch-dir really makes; it had checked
the working directory's tmp/. `test/owned-scratch.test.ts` runs two
workers on one lane in the order that failed.
