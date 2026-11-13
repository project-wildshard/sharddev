# update --pins refuses a dirty repo

- `wildshard update --pins` now runs `git status` first and refuses
  uncommitted or untracked changes (`update-pins-dirty`) and a repo git
  does not track (`update-pins-no-git`: no repo, or package.json not
  committed, as in a folder another repo ignores). Why: the codemods
  edit the shard source, and over uncommitted work the author can't
  tell their edits from the codemods'.
- No opt-out flag: sharddev has no allow-dirty pattern (upload's
  `--commit <sha>` names other bytes, it doesn't skip the check).
- A review caught two gaps, both fixed: `status.showUntrackedFiles=no`
  hid untracked files (now `--untracked-files=normal`), and a missing
  git binary read as "put the repo in git" (now `git not found`).
