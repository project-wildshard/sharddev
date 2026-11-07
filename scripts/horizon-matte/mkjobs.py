#!/usr/bin/env python3
"""mkjobs.py [--shard <slug> | --config <json>] [--set day2] <workdir> — the codex image_gen jobs for one prompt set of a
shard's painted horizon (one job per capture heading), for run_codex.py.

<workdir> holds the in-game captures and references the set names (Driftwood day2: day-<h>.jpg + ref-hero.jpg); writes
<workdir>/jobs-<set>.json. The prompts live in src/shards/<shard>/art/horizon-matte.json under jobs.<set>: `common`
plus, per heading, [light, content]. Driftwood's day2 set = art/driftwood-isle/round-9-horizon (was mkjobs_day2.py).
"""
import argparse
import json
import os

import config

ap = config.add_args(argparse.ArgumentParser(description=__doc__.split('\n')[0]))
ap.add_argument('--set', default='day2', help='the prompt set in the config (default day2)')
ap.add_argument('workdir', nargs='?', default=None, help='captures in, jobs-<set>.json out (default: the cwd)')
a = ap.parse_args()
cfg = config.load(a)
S = cfg['jobs'][a.set]
H = os.path.abspath(a.workdir) if a.workdir else os.getcwd()
w, h = cfg['capture']['width'], cfg['capture']['height']

jobs = []
for d, (light, content) in ((int(k), v) for k, v in S['segments'].items()):
    p = (S['common'] + f"\nTHIS SEGMENT: {light}. In the middle 40 %: {content}.\n\n"
         "TASK FOR CODEX: Use the built-in image_gen tool to EDIT the FIRST attached reference image into exactly ONE "
         f"landscape image, {w}x{h}, as described above (same framing, horizon exactly at the vertical middle). One generation only. "
         "Do not write any code or files; just generate the image.")
    jobs.append({"id": f"{a.set}-{d}", "inputs": [f"{H}/{i.format(d=d)}" for i in S['inputs']], "prompt": p, "out": f"{H}/{S['out'].format(d=d)}"})
with open(f'{H}/jobs-{a.set}.json', 'w') as f:
    json.dump(jobs, f, indent=1)
print(len(jobs))
