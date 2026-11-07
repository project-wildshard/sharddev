#!/usr/bin/env python3
"""Model-free checks for decide.py: Jev-style confidence, flags, the sets' shape. `python3 scripts/decide/test_decide.py`"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import decide  # noqa: E402 — the model is only imported inside Model()


def close(a: float, b: float) -> bool:
    return abs(a - b) < 1e-9


# docs.typesafe.ai/confidence.md: a 3-option Choice at 0.85 → (3 × 0.85 − 1) / 2 = 0.775
assert close(decide.jev_confidence("choice", [0.85, 0.1, 0.05]), 0.775)
# a 60/40 two-way Choice is 0.2 in Jev's terms (Clef's reference code reports 0.6)
assert close(decide.jev_confidence("choice", [0.6, 0.4]), 0.2)
assert close(decide.jev_confidence("noul", [0.5]), 0.0) and close(decide.jev_confidence("noul", [0.0]), 1.0)
# Score: all mass on one level is 1; an even spread is 0
assert close(decide.jev_confidence("score", [0, 1, 0, 0]), 1.0)
assert close(decide.jev_confidence("score", [0.25, 0.25, 0.25, 0.25]), 0.0)

spec = {"flags": {"screen": {"choice_in": ["loading", "blank"], "min_probability": 0.5}, "bad": {"noul_at_least": 0.7}},
        "questions": {"screen": {}, "bad": {}}}
answers = {"screen": {"probabilities": {"world": 0.5, "loading": 0.3, "blank": 0.2}}, "bad": {"noul": 0.69}}
assert decide.flags_for(spec, answers) == {"screen": True, "bad": False, "any": True}

for path in sorted((Path(__file__).parent / "sets").glob("*.json")):
    s = decide.load_set(str(path))
    assert s["name"] == path.stem, path
    for qid, q in s["questions"].items():
        assert q["type"] in ("noul", "choice", "score"), (path, qid)
    json.dumps(s)

assert decide.tail_trim("abcdef", 3) == "…def"
print("decide: ok")
