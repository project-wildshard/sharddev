# <Shard name> · design.md

<!-- T1's human twin (WORLDCLAW-SHARD T1, R15, D87). Copy to src/shards/<slug>/design/design.md. The prose sections are for
people; the ```json worldclaw block at the end is for the checks (spec-check, twin-check) and must agree with spec.json
id for id. design.md owns intent and Jake's words; spec.json owns the numbers. A WorldClaw run is `"scope": "full"`
with a `run`; a director's single stage on a shipped shard (§S, D91) writes `"scope": "slice"` and no `run`. -->

## Vision (P1, Jake, verbatim)
"<the sentence>"

## The pitch (P2)
<one paragraph> · **Pillars:** moment · session · return · **Verb:** … · **Weapon:** … · **Roster:** … · **Boss:** … ·
**Look:** <the style bible's name> (`style-bible.md`).

## Places
| id | Place | Role | Beat |
|---|---|---|---|
| <id> | <name> | <role> | <what happens here> |

## Happenings
- **<name>** (signal: <what the player sees or hears>; seen from <places>).

## The critical path and routes
<the golden path as place ids> · the routes as typed legs (walk, climb, sled, rope …).

## The quest
| # | Step | Where | Why / what | Gets | Mechanics |
|---|---|---|---|---|---|

## The session slice (P9)
<place ids in play order, with the time it takes>

## §run (06 §10.7)
- mode: guided | zero-shot · until: P<n> (the bound, if any) · P0's answers
- step: P<n> (the machine block's `run.stage`: one value, written together) · waitingOn: jake | codex-quota (with its time) · resentAt · next: …
- stop: continue | done | blocked | quota(<reset>) (set before a session exits)
- the pending board and question · queued commands
- the last build SHA · the live page's URL · the frames folder

## Verdict log
- P<n>: "<Jake's words, verbatim>" (ask id).

## The checkpoints (§2b; one entry per pinned place)
- <place>: the accepted camera, the assets, the gate evidence, the rejected variants, the next place.

```json worldclaw
{
  "slug": "<slug>",
  "scope": "full",
  "places": [{ "id": "<id>", "role": "spawn", "name": "<name>", "beat": "<beat>" }],
  "happenings": [],
  "npcs": [],
  "enemyZones": [],
  "elites": [],
  "boss": null,
  "quest": [],
  "routes": [],
  "gates": ["N", "E", "S", "W"],
  "slice": [],
  "run": { "mode": "guided", "stage": "P0" }
}
```
