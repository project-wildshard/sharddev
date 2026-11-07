"""config.py — a shard's painted-horizon parameters (PINE-HOLLOW-REMASTER PH-0.3), shared by mkjobs / stitch / key.

src/shards/<shard>/art/horizon-matte.json holds the capture (eye, headings, vfov, frame size, tod), the strip (size,
elevation range — HorizonMatte.ts draws the same range), the stitch feathering, the key's feet and the codex prompt sets.
Every script takes `--shard <slug>` (default driftwood-isle) or `--config <json>`.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_SHARD = 'driftwood-isle'


def add_args(ap):
    ap.add_argument('--shard', default=DEFAULT_SHARD, help='the shard slug (default driftwood-isle)')
    ap.add_argument('--config', default=None, help='a config JSON (default the shard\'s art/horizon-matte.json)')
    return ap


def load(args):
    p = Path(args.config) if args.config else HERE.parents[1] / 'src' / 'shards' / args.shard / 'art' / 'horizon-matte.json'
    if not p.exists():
        raise SystemExit(f'horizon-matte: no config for {args.shard} ({p}); copy art/horizon-matte.json from Driftwood and re-shoot the capture')
    return json.loads(p.read_text())
