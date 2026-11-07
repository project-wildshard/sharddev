#!/usr/bin/env python3
"""calibrate.py — score a decide.py batch against hand labels (E394 D3, project/archive/2026-10-03-decision-models.md).

    python3 scripts/decide/calibrate.py <set> <results.jsonl> <labels.tsv> [<labels.tsv> …]

labels.tsv: `id <TAB> screen <TAB> corrupt <TAB> note` for capture-status, `id <TAB> garbled <TAB> note` for
text-garbled; `id` is the image's file stem, `#` lines are comments. Prints, per check:
- AUC (threshold-free: the chance a random bad item scores above a random good one);
- at the set's own threshold: recall on bad items and the share of good items flagged;
- a threshold fitted on a random half (the lowest that keeps ≥ 90 % recall there) and the same two numbers on the
  OTHER half, so the pass / fail is not tuned on the data it is judged on;
- the misses and false flags by id, worst first.
The D3 bar: ≥ 90 % recall on bad items while flagging ≤ 20 % of good ones.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path


def read_labels(paths: list[str]) -> dict[str, list[str]]:
    labels = {}
    for path in paths:
        for line in Path(path).read_text().splitlines():
            if line.strip() and not line.startswith("#"):
                cols = line.split("\t")
                labels[cols[0]] = cols[1:]
    return labels


def checks_for(set_name: str):
    """(name, is_bad(label cols), score(answers), threshold) per check."""
    if set_name == "capture-status":
        bad_screens = ("loading", "blank", "error")

        def screen_bad(cols):
            return cols[0] in bad_screens

        def screen_score(a):
            return sum(a["screen"]["probabilities"][s] for s in bad_screens)

        def corrupt_bad(cols):
            return cols[1] == "1"

        def any_bad(cols):
            return screen_bad(cols) or corrupt_bad(cols)

        def any_score(a):
            return max(screen_score(a), a["corrupt"]["noul"])

        return [
            ("screen: loading / blank / error", screen_bad, screen_score, 0.5),
            ("corrupt: render glitch", corrupt_bad, lambda a: a["corrupt"]["noul"], 0.5),
            ("any flag", any_bad, any_score, 0.5),
        ]
    if set_name == "text-garbled":
        return [("garbled text", lambda cols: cols[0] == "1", lambda a: a["garbled"]["noul"], 0.5)]
    sys.exit(f"calibrate: no label mapping for set {set_name}")


def auc(pos: list[float], neg: list[float]) -> float:
    if not pos or not neg:
        return float("nan")
    wins = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
    return wins / (len(pos) * len(neg))


def rates(items, threshold):
    bad = [s for s, b, _ in items if b]
    good = [s for s, b, _ in items if not b]
    recall = sum(s >= threshold for s in bad) / len(bad) if bad else float("nan")
    flagged = sum(s >= threshold for s in good) / len(good) if good else float("nan")
    return recall, flagged, len(bad), len(good)


def fit_threshold(items, target_recall=0.9):
    bad = sorted((s for s, b, _ in items if b), reverse=True)
    if not bad:
        return 0.5
    k = max(1, int(round(target_recall * len(bad) + 0.4999)))
    return bad[min(k, len(bad)) - 1]


def main() -> None:
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    set_name, results_path, label_paths = sys.argv[1], sys.argv[2], sys.argv[3:]
    labels = read_labels(label_paths)
    rows = []
    for line in Path(results_path).read_text().splitlines():
        r = json.loads(line)
        if "error" in r:
            print("error:", r["images"], r["error"])
            continue
        stem = Path(r["images"][0]).stem
        if stem not in labels:
            continue
        rows.append((stem, labels[stem], r["answers"]))
    print(f"{set_name}: {len(rows)} labelled results ({len(labels)} labels)")
    rng = random.Random(394)
    for name, is_bad, score, threshold in checks_for(set_name):
        items = [(score(a), is_bad(cols), stem) for stem, cols, a in rows]
        pos = [s for s, b, _ in items if b]
        neg = [s for s, b, _ in items if not b]
        recall, flagged, nb, ng = rates(items, threshold)
        print(f"\n## {name}: {nb} bad / {ng} good · AUC {auc(pos, neg):.3f}")
        print(f"  at the set's threshold {threshold}: recall {recall:.0%} · good flagged {flagged:.0%}")
        # split-half: fit on A, judge on B, and the other way round
        shuffled = items[:]
        rng.shuffle(shuffled)
        half = len(shuffled) // 2
        for fit, test, tag in ((shuffled[:half], shuffled[half:], "A→B"), (shuffled[half:], shuffled[:half], "B→A")):
            t = fit_threshold(fit)
            r2, f2, b2, g2 = rates(test, t)
            print(f"  fitted on {tag[0]} (threshold {t:.3f}), judged on {tag[2]}: recall {r2:.0%} of {b2} · good flagged {f2:.0%} of {g2}")
        misses = sorted((s, stem) for s, b, stem in items if b and s < threshold)
        false = sorted(((s, stem) for s, b, stem in items if not b and s >= threshold), reverse=True)
        if misses:
            print("  missed:", ", ".join(f"{stem} {s:.2f}" for s, stem in misses[:12]))
        if false:
            print("  false flags:", ", ".join(f"{stem} {s:.2f}" for s, stem in false[:12]))


if __name__ == "__main__":
    main()
