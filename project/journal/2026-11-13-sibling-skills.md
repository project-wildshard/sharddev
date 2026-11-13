# The three sibling skills (SHARD-AUTHORING SA27)

> Written by: Claude

- `skills/wildshard-mockup-to-model`, `skills/wildshard-goldens` and `skills/wildshard-upgrade` ship beside the core
  `wildshard` skill (J314 Q6). `new` writes all four to `.claude/skills/<name>/SKILL.md` for the reference,
  `--empty` and `--template blender` repos (`SKILLS`, `skillSource`, `skillFile` in `newProject.ts`).
- Condensed for authors from engine's `mockup-to-model` and the shard repos' `goldens` skills: the engine-only
  harness (serve-build, the 24-camera boards, TRELLIS paths) is left out; an author's goldens are the hero and the
  proof tape.
- `wildshard-upgrade` keeps the row's name although J314 Q27 retired the verb: it says `update --pins` is not built
  yet (SA18) and walks the pin move by hand (copy the sdk's specs, `pnpm install`, refresh guide and skills, check).
- `skill.test.ts` covers all four: under 80 lines, every `GUIDE.md#anchor` resolves (mutation-checked), glossary,
  `new` writes each byte for byte. `GUIDE.md` §1, §2 and §7 now name the four skills.
- Two `claude -p` writing-for-agents reviews: every MUST taken (pins are specs, not numbers; a generator must be
  imported; blender GLBs live at `blobs/glb/<sha>.glb`; `--stamp-existing` does not satisfy upload; done-whens).
