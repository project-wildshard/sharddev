"""Run one OB7 plot/model batch through the established patched generators.

The caller must hold the shared model lock and receive the coordinator's
START. Each invocation loads exactly one model and exits after one plot.
The finite run-locked.sh wrapper owns admission and the 30-minute deadline.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", choices=["score", "moss", "medium"])
    parser.add_argument("plot")
    parser.add_argument("--out", required=True)
    parser.add_argument("--seeds", default="701", help="SFX retake seeds; score always renders 701 and 702")
    parser.add_argument("--families", default="", help="Optional exact SFX families from this plot")
    args = parser.parse_args()
    if (HERE.parents[2] / '.git/quiet').exists():
        raise SystemExit('Official Simulator quiet window is open; no model loaded')
    score = json.loads((HERE / "ob7-score-jobs.json").read_text())
    if f"ob7/{args.plot}" not in score["jobs"]:
        parser.error("unknown OB7 plot")
    if args.model == "score":
        import gen_minimax

        sys.argv = ["gen_minimax", "--jobs", "ob7-score-jobs.json",
                    "--keys", f"ob7/{args.plot}", "--seeds", "701,702",
                    "--out", args.out]
        gen_minimax.main()
        return
    families = json.loads((HERE / "ob7-sfx-jobs.json").read_text())["families"]
    keys = [key for key, row in families.items() if row["into"] == args.plot]
    if args.families:
        selected = args.families.split(',')
        if not set(selected) <= set(keys):
            parser.error('retakes must name this plot\'s declared SFX families')
        keys = selected
    sys.argv = ["gen_sfx", "--jobs", "ob7-sfx-jobs.json", "--families",
                ",".join(keys), "--seeds", args.seeds, "--out", args.out]
    if args.model == "moss":
        import gen_sfx_moss

        # Retain the per-take memory refusal without its unbounded sleep.
        def check_memory() -> None:
            subprocess.run(["bash", str(gen_sfx_moss.GATE)], check=True,
                           env={**os.environ, "EXCLUDE_PID": str(os.getpid())})

        gen_sfx_moss.wait_for_memory = check_memory
        gen_sfx_moss.main()
    else:
        import gen_sfx

        sys.argv += ["--model", "medium"]
        gen_sfx.main()


if __name__ == "__main__":
    main()
