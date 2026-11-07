#!/usr/bin/env python3
"""decide.py — typed, calibrated decisions from a local decision model (E394, project/archive/2026-10-03-decision-models.md).

Asks a frozen question set (scripts/decide/sets/<name>.json) about an image and/or a text state, with the local
Clef-flash 4-bit model (MLX, ~6 GB, ~0.3 s a call on the M5 Max), and prints one JSON line per item:
the Jev/SystemOne answers, Jev-style confidence (recomputed here: Clef's reference code returns the max probability,
Jev a spread statistic, so thresholds would not port), and the set's flags.

    decide.sh run   <set> [--image a.jpg …] [--state TEXT | --state-file F]
    decide.sh batch <set> --images <list.txt | dir | items.jsonl> [--out results.jsonl]
    decide.sh qa [--set capture-status] <image | dir> …   capture QA: writes <frame>.qa.json, exit 3 if any is flagged

Run it through scripts/decide/decide.sh (the venv + the machine-wide model lock). One process loads the model once
and answers the whole batch. Every answer is also appended to ~/.cache/wildshard-decide/log.jsonl.
Setup, speed and traps: ~/projects/localai/docs/decision-models.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODEL_DIR = Path(os.environ.get("DECIDE_MODEL", Path.home() / "projects/weights/manual/mlx-community/clef-flash-4bit"))
LOG = Path(os.environ.get("DECIDE_LOG", Path.home() / ".cache/wildshard-decide/log.jsonl"))
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}


def load_set(name: str) -> dict:
    path = Path(name) if name.endswith(".json") else HERE / "sets" / f"{name}.json"
    spec = json.loads(path.read_text())
    for key in ("name", "version", "questions"):
        if key not in spec:
            sys.exit(f"decide: set {path} has no '{key}'")
    for qid in spec.get("flags", {}):
        if qid not in spec["questions"]:
            sys.exit(f"decide: set {path} flags '{qid}', which is not one of its questions")
    return spec


# --------------------------------------------------------------------------- Jev-style confidence
# https://docs.typesafe.ai/confidence.md "How confidence is calculated". Noul: |2p − 1|. Choice: (p_max − 1/n)/(1 − 1/n).
# Score: 1 − (probability-weighted distance from the peak level) / (the same for an even spread from the middle).


def jev_confidence(qtype: str, probs: list[float]) -> float:
    n = len(probs)
    if qtype == "noul":
        return abs(2 * probs[0] - 1)
    peak_p = max(probs)
    if qtype == "choice":
        return max(0.0, min(1.0, (n * peak_p - 1) / (n - 1)))
    peak = probs.index(peak_p)
    spread = sum(p * abs(i - peak) for i, p in enumerate(probs))
    even = sum(abs(i - (n - 1) / 2) for i in range(n)) / n
    return max(0.0, min(1.0, 1 - spread / even))


def normalise(spec: dict, response: dict) -> dict:
    """Add Jev-style confidence to every answer (keeping Clef's own value as clef_confidence)."""
    out = {}
    for qid, answer in response["answers"].items():
        q = spec["questions"][qid]
        a = dict(answer)
        if q["type"] == "noul":
            a["confidence"] = round(jev_confidence("noul", [a["noul"]]), 4)
        else:
            a["clef_confidence"] = a.get("confidence")
            a["confidence"] = round(jev_confidence(q["type"], list(a["probabilities"].values())), 4)
        out[qid] = a
    return out


def flags_for(spec: dict, answers: dict) -> dict:
    """A set's flags: {qid: {"noul_at_least": p}} or {qid: {"choice_in": [ids], "min_probability": p}} or
    {qid: {"score_at_least": s}}. Returns {qid: true|false}; "any" is true when one fired."""
    fired = {}
    for qid, rule in spec.get("flags", {}).items():
        a = answers[qid]
        if "noul_at_least" in rule:
            fired[qid] = a["noul"] >= rule["noul_at_least"]
        elif "choice_in" in rule:
            mass = sum(a["probabilities"][c] for c in rule["choice_in"])
            fired[qid] = mass >= rule.get("min_probability", 0.5)
        elif "score_at_least" in rule:
            fired[qid] = a["score"] >= rule["score_at_least"]
    fired["any"] = any(fired.values())
    return fired


# --------------------------------------------------------------------------- model


class Model:
    def __init__(self) -> None:
        if not (MODEL_DIR / "joint_head.safetensors").exists():
            sys.exit(f"decide: no Clef checkpoint at {MODEL_DIR} (fetch: ~/projects/weights/bin/fetch-repo.sh "
                     "mlx-community/clef-flash-4bit)")
        sys.path.insert(0, str(MODEL_DIR))
        import clef_mlx  # noqa: E402 — lives next to the weights, version-matched to them
        import mlx.core as mx

        # MLX keeps freed GPU buffers in a cache for reuse; uncapped it grew a 6.8 GB model to an 18.6 GB peak over 5
        # images. The cap keeps a batch small on a box shared with music / SFX / 3D jobs.
        mx.set_cache_limit(int(float(os.environ.get("DECIDE_MLX_CACHE_GB", "1")) * 1e9))
        started = time.perf_counter()
        self.clef = clef_mlx.load(MODEL_DIR)
        self.load_s = time.perf_counter() - started
        self.name = MODEL_DIR.name

    def ask(self, spec: dict, state, images: list[str]) -> dict:
        from PIL import Image

        request = {"model": self.name, "state": state, "questions": spec["questions"]}
        if images:
            request["images"] = [Image.open(p).convert("RGB") for p in images]
            if spec.get("media_kwargs"):
                request["media_kwargs"] = spec["media_kwargs"]
        started = time.perf_counter()
        response = self.clef.systemone(request, max_length=spec.get("max_length", 16384), truncate=False)
        response["usage"]["latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
        return response


def tail_trim(text: str, max_chars: int) -> str:
    """Keep the END of a long state (logs, transcripts): the reference code would silently cut the tail instead."""
    return text if len(text) <= max_chars else "…" + text[-max_chars:]


def answer_one(model: Model, spec: dict, state, images: list[str]) -> dict:
    if isinstance(state, str):
        state = tail_trim(state, spec.get("max_state_chars", 40000))
    response = model.ask(spec, state, images)
    answers = normalise(spec, response)
    record = {
        "set": spec["name"],
        "set_version": spec["version"],
        "model": response["model"],
        "images": images,
        "state_sha": hashlib.sha256(json.dumps(state, sort_keys=True).encode()).hexdigest()[:12],
        "answers": answers,
        "flags": flags_for(spec, answers),
        "usage": response["usage"],
    }
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as log:
        log.write(json.dumps({"t": time.strftime("%Y-%m-%dT%H:%M:%S"), **record}) + "\n")
    return record


def list_items(arg: str, state) -> list[tuple[list[str], object]]:
    """(images, state) per item: a dir (recursive), a list file (one image path per line), or a .jsonl file with
    {"images": [...], "state": ...} per line, for items that each carry their own state (a mockup's own strings)."""
    p = Path(arg)
    if p.is_dir():
        return [([str(f)], state) for f in sorted(p.rglob("*")) if f.suffix.lower() in IMAGE_EXT]

    def resolve(entry: str) -> str:
        # a relative entry is relative to the list file, not to wherever decide.sh was started
        return entry if Path(entry).is_absolute() else str((p.parent / entry).resolve())

    lines = [line.strip() for line in p.read_text().splitlines() if line.strip() and not line.startswith("#")]
    if p.suffix == ".jsonl":
        return [([resolve(i) for i in item.get("images", [])], item.get("state", state)) for item in map(json.loads, lines)]
    return [([resolve(line)], state) for line in lines]


def run_qa(model: Model, spec: dict, args, outs) -> int:
    """One sidecar per frame, `<frame>.qa.json`: the answers, the flags, and `flagged`. A summary line per frame goes to
    stdout (and DECIDE_OUT). 0 = nothing flagged, 3 = something flagged."""
    paths = []
    for arg in args.images:
        path = Path(arg)
        paths += sorted(f for f in path.rglob("*") if f.suffix.lower() in IMAGE_EXT) if path.is_dir() else [path]
    any_flagged = False
    for path in paths:
        record = answer_one(model, spec, spec.get("state", ""), [str(path)])
        forced = path.stem in args.force_flag
        flagged = bool(record["flags"]["any"]) or forced
        any_flagged = any_flagged or flagged
        sidecar = {"set": spec["name"], "version": spec["version"], "model": record["model"], "flagged": flagged,
                   "forced": forced, "flags": record["flags"], "answers": record["answers"],
                   "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
        path.with_suffix(".qa.json").write_text(json.dumps(sidecar, ensure_ascii=False, indent=1) + "\n")
        first = next(iter(record["answers"].values()))
        verdict = (f"{first['choice']} {first['probabilities'][first['choice']]:.2f}" if "choice" in first
                   else f"{first.get('noul', first.get('score'))}")
        line = f"{'FLAG' if flagged else 'ok  '} {path} · {verdict}{' (forced)' if forced else ''}"
        print(line, flush=True)
        for out in outs:
            out.write(line + "\n")
            out.flush()
    for out in outs:
        out.close()
    return 3 if any_flagged else 0


def main() -> None:
    parser = argparse.ArgumentParser(prog="decide", description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run", help="one item")
    run.add_argument("set")
    run.add_argument("--image", action="append", default=[])
    run.add_argument("--state")
    run.add_argument("--state-file")
    batch = sub.add_parser("batch", help="one image per item, the model loaded once")
    batch.add_argument("set")
    batch.add_argument("--images", required=True,
                       help="a dir (recursive), a file with one path per line, or a .jsonl of {images, state}")
    batch.add_argument("--state", help="the same state for every item (default: the set's 'state')")
    batch.add_argument("--out", help="also write the JSON lines here")
    qa = sub.add_parser("qa", help="capture QA: did each frame land in the 3D world? Writes <frame>.qa.json next to "
                                   "each frame and prints one line per frame; exit 3 when any is flagged")
    qa.add_argument("images", nargs="+", help="image files or dirs (recursive)")
    qa.add_argument("--set", default="capture-status")
    qa.add_argument("--force-flag", action="append", default=[], metavar="STEM",
                    help="treat the frame with this file stem as flagged (exercises a caller's re-take path)")
    args = parser.parse_args()

    spec = load_set(args.set)
    model = Model()
    print(f"decide: {model.name} loaded in {model.load_s:.1f} s; set {spec['name']} v{spec['version']}", file=sys.stderr)

    # decide.sh sets DECIDE_OUT: run-locked.sh sends stdout to its log, so the answers come back through a file
    outs = [open(path, "w") for path in {os.environ.get("DECIDE_OUT"), getattr(args, "out", None)} if path]

    if args.cmd == "qa":
        sys.exit(run_qa(model, spec, args, outs))

    if args.cmd == "run":
        state = Path(args.state_file).read_text() if args.state_file else (args.state or spec.get("state", ""))
        line = json.dumps(answer_one(model, spec, state, args.image), ensure_ascii=False)
        print(line)
        for out in outs:
            out.write(line + "\n")
            out.close()
        return

    state = args.state or spec.get("state", "")
    items = list_items(args.images, state)
    for i, (images, item_state) in enumerate(items, 1):
        try:
            record = answer_one(model, spec, item_state, images)
        except Exception as error:  # noqa: BLE001 — one bad file must not end the batch
            record = {"set": spec["name"], "images": images, "error": f"{type(error).__name__}: {error}"}
        line = json.dumps(record, ensure_ascii=False)
        print(line, flush=True)
        for out in outs:
            out.write(line + "\n")
            out.flush()
        if i % 25 == 0:
            print(f"decide: {i}/{len(items)}", file=sys.stderr)
    for out in outs:
        out.close()


if __name__ == "__main__":
    main()
