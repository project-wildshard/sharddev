---
name: wildshard-goldens
description: Refresh a Wildshard shard repo's known-good shots and proofs - the hero (the shard's three card images, stamped in hero.json) and the proof tape (proof.json, played by `wildshard check`). Use after any change to the world, before an upload, when check or upload refuses with hero-stale, hero-unchanged, proof-failed or proof-tape-invalid, or when asked to refresh the goldens, the hero or the proof.
---

# wildshard-goldens

A shard repo holds two known-good records of its world, both in the shard source: the **hero** (three card images,
stamped in `hero.json` with a hash of the shard source) and, if it has one, the **proof tape** (`proof.json`, which
`wildshard check .` plays headlessly). Refresh each when the world it records changed on purpose; never to quiet a
refusal you have not understood. `GUIDE.md` at the repo root holds the facts; a pointer `GUIDE.md#<anchor>` is the
guide heading with that anchor.

## When to refresh

| Record | Refresh it when | The refusal that tells you |
|---|---|---|
| Hero | After your last change to the world, before every upload: a new version needs a new hero | `GUIDE.md#hero-stale` (build), `GUIDE.md#hero-unchanged` (upload) |
| Proof tape | A quest, creature, item or rule the tape walks changed on purpose | `GUIDE.md#proof-failed`, `GUIDE.md#proof-tape-invalid` |

## The hero, in order

These steps need `src/manifest.json`, which `wildshard new` writes for the default template only; without it, write
down that the hero needs the Wildshard team.

1. **Real image files.** `manifest.json` and `data/card.json` must name the same image files inside the shard source,
   not the `data:` card `new` wrote; change both together (`GUIDE.md#2-the-shard-source`). Done when both point at
   files such as `card/thumb.jpg`.
2. **A served build carrying this exact shard source.** Today that needs an engine checkout, not
   `wildshard dev` (`GUIDE.md#the-hero`). Done when you have its URL, or have written down that it needs the Wildshard team.
3. **Capture.** `wildshard hero . --base <url>` (`GUIDE.md#the-hero`). Done when `hero.json` and the three images are
   rewritten.
4. **Look at all three images** with your own eyes or the Read tool: the shard, not a loading screen, a black frame or
   another shard. Done when each shows the current world.
5. **Commit** the images and `hero.json` together (`GUIDE.md#uploading` step 2), then `wildshard check .`. Done at
   `check pass`.

`wildshard hero . --stamp-existing` stamps the images already there as current, and clears `hero-stale` after a change
no camera can see, once step 4 shows they match the world. Upload still refuses that hero for a new version
(`GUIDE.md#hero-unchanged`): capture before uploading (`GUIDE.md#every-verb`).

## The proof tape, in order

1. Run `wildshard check .` and read the refusal. `proof-tape-invalid`: fix `proof.json` where the message says, then
   go to step 3. `proof-failed`: the message names the step that did not happen. Done when you know the rule and the
   step.
2. Decide which one is wrong. If you did not mean to change what that step tests, fix the shard source, not the tape.
   If you did, change that one step of `proof.json` to the new behaviour. Done when one of the two is edited.
3. Run `wildshard prove . src/proof.json` alone while you work (`GUIDE.md#every-verb`), then `wildshard check .`.
   Done at `check pass`.

## Rules

- Stamp or edit a record only after the look in hero step 4 or the decision in proof step 2.
