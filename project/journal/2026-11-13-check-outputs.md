# check reads a folder with declared outputs

HOW-WE-BUILD TS21, Open Plots. `wildshard check .` on shard-open-plots
failed at once (`source-file-missing`, an lstat of
`src/shards/open-plots/assets`): its one folder declares 18 outputs in
`outputs.json` and has no product of its own, while `build-shards`
builds each output with `--output=<slug>`.

`check` now takes `--output=<slug>` like `build`, and the wrapper
(`scripts/wildshard.mjs`), for `check` on a folder with declared
outputs and no `--output`, checks each output in turn with its own
composed manifest (the same `outputManifest` and slug checks `build`
gets), into `<folder>/<slug>` when a folder is named, and prints one
verdict: `check pass|fail: 18 outputs[, failed: ...]`. `--json` on
such a folder asks for one `--output`. A setup error in one output
fails that output and the rest still run. A hand-written source
refuses `--output`.

A first draft looped inside the CLI with the folder's base manifest;
its review caught that, so the loop lives in the wrapper, where the
manifest is composed. Today every plot then stops at `hero-stale`
(the folder's hero predates its content), which is Open Plots' own
recapture, not this.
