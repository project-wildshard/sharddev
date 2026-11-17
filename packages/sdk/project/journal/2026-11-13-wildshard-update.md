# `wildshard update` and the agent files (SHARD-AUTHORING SA28)

> Written by: Claude

- One writer, `syncAgentFiles` in `src/sharddev/agentFiles.ts`, runs for both `new` and `update` (J314 Q7, Q8, Q27).
  It rewrites `GUIDE.md` and the four `.claude/skills/wildshard*/SKILL.md` from the installed sdk (only when the bytes
  differ), and writes `.agents/skills/wildshard*` (relative links to the `.claude/skills/` folders), `AGENTS.md` (read
  `GUIDE.md` first; skills in `.claude/skills/`) and `CLAUDE.md` (`@AGENTS.md`) only when missing. An `AGENTS.md`,
  `CLAUDE.md` or link the author changed is left, and `update` prints `left <file>: you changed it`.
- Chosen without Jake (asleep): `update` also adds the links, `AGENTS.md` and `CLAUDE.md` when a repo made before
  SA28 lacks them; adding a missing file clobbers nothing. `PAST_AGENTS_TEXTS` lets a later sdk replace an untouched
  older `AGENTS.md` without calling it the author's.
- `update` refuses a folder whose `package.json` does not list `@wildshard/sdk` (`update-target`) and `--pins`
  (`update-pins`, SA18). The `wildshard-upgrade` skill's step 5 is now `wildshard update`; `GUIDE.md` §2, §6, §7.
- `agentFiles.test.ts`: after a fake sdk bump, exactly `GUIDE.md` and the four skills change while edits to `src/`,
  README, `package.json`, `AGENTS.md` and a file of the author's survive (mutation-checked).
- Proof in a `wildshard new` repo: `claude -p` listed the four skills; `codex exec` (0.167.2) listed the four, and
  answered NONE in a control copy with no `.agents/` folder, so Codex reads them through the links.
- A `claude -p` review's one MUST: `performancePolicy.ts` took an `AGENTS.md` at the cwd as proof of a first-party
  checkout, so a `new` repo with a first-party slug (`driftwood-isle`) would have got the warn-only budget policy.
  The gate now also needs a package named `@wildshard/shard-*` (all six first-party repos are); tested and
  mutation-checked. Its SHOULDs taken: upgrade skill step order, done-whens naming added files, a bad
  `package.json` refuses as `update-target`, link and past-text tests. Not taken: Windows symlinks (no Windows
  author yet; a later row can fall back to copies).
