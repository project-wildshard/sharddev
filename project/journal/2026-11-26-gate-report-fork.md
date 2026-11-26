# sharddev's gate ends a red push with its failing step (opus-chunk2, meta QA 11-25 row 75)

- repo-kit 4e0c2a5 taught the stamped gate to report a failed job by its failing step, last lines and hatch, with the
  whole output in tmp/push-gate/. sharddev's run-checks.mjs is a diverged fork the stamp skips, so the f4ca07c9 push
  showed only passing tests again; gate-report.mjs is copied byte for byte and wired here by hand, with a test.
