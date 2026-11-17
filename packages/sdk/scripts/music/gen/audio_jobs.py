"""Model-free validation and manifest keys shared by the audio job scripts."""

from __future__ import annotations

import json
import re
from pathlib import Path


def tag_name(value: str) -> str:
    if re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value) is None:
        raise ValueError(f"invalid audio set/tag: {value!r}")
    return value


def family_key(family: str) -> str:
    """Existing bed-forest / hum-shrine and Nine Dragon's bed.nd.market / hum.lantern."""
    for prefix in ("bed-", "hum-", "bed.", "hum."):
        if family.startswith(prefix):
            return family[len(prefix):]
    raise ValueError(f"loop family needs a bed/hum prefix: {family}")


def read_sfx(path: Path) -> dict:
    doc = json.loads(path.read_text())
    for family, job in doc["families"].items():
        if job["kind"] not in ("oneshot", "bed", "hum"):
            raise ValueError(f"{family}: unknown kind")
        if not job["prompt"] or not job["desc"] or job["duration"] <= 0:
            raise ValueError(f"{family}: needs prompt, description and positive duration")
        if job["kind"] != "oneshot":
            family_key(family)
        if "into" in job:
            tag_name(job["into"])
    return doc


def read_score(path: Path) -> dict:
    doc = json.loads(path.read_text())
    for key, job in doc["jobs"].items():
        instrument_test = key.startswith("test/") and job["slot"] == key.replace("/", "-", 1)
        if key != f"{job['style']}/{job['slot']}" and not instrument_test:
            raise ValueError(f"{key}: must match style/slot")
        if not job["prompt"] or job["duration"] <= 0 or job["lyrics"] not in doc["lyrics"]:
            raise ValueError(f"{key}: needs prompt, positive duration and a known lyrics key")
    return doc
