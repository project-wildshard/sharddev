"""The day-segment prompts of art/driftwood-isle/round-9-horizon (codex image_gen, one run per heading).

Kept for the old command line: the prompts now live in src/shards/driftwood-isle/art/horizon-matte.json (jobs.day2) and this is
`mkjobs.py --shard driftwood-isle --set day2 <workdir>` (PINE-HOLLOW-REMASTER PH-0.3).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# usage: mkjobs_day2.py <workdir>  (holds day-<h>.jpg captures + ref-hero.jpg; writes jobs-day2.json there)
os.execv(sys.executable, [sys.executable, os.path.join(HERE, 'mkjobs.py'), '--shard', 'driftwood-isle', '--set', 'day2', *sys.argv[1:2]])
