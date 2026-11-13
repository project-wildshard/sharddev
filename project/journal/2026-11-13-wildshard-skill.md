# The wildshard skill (SHARD-AUTHORING SA14)

> Written by: Claude

- `skills/wildshard/SKILL.md` ships in the package (`files`), and `new` writes it to
  `.claude/skills/wildshard/SKILL.md` in reference and `--empty` projects, next to `GUIDE.md`.
- The skill is the loop in order, one `GUIDE.md#<anchor>` pointer per step, no facts copied. Pointers are plain
  `GUIDE.md#anchor` text, not relative links: the skill sits two folders deeper in a project than in the package.
- `skill.test.ts`: under 80 lines, every pointer is a real heading (mutation-checked with a broken anchor), the eight
  steps in order, glossary words, `new` copies it byte for byte.
- Proof: a `claude -p` session in a `new`-made, git-inited folder listed `wildshard` among its skills and picked it for
  uploading to staging. `check .` still passes with `.claude/` in the shard source.
- A `claude -p` review against writing-for-agents gave five MUSTs, all taken: prepare acts on the built folder, check
  again after the hero (the guide's upload order), no ban on the word build, a done-when per step, re-run the command
  that refused rather than `check`.
