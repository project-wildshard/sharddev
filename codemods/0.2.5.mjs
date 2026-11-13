// SHARD-AUTHORING SA18: the codemod for the sdk release named by this file (`codemods/<version>.mjs`).
// `wildshard update --pins` runs every codemod whose version v is above the repo's old sdk and at most the new one
// (old < v <= new), oldest first, after `pnpm install` and before `wildshard update` rewrites GUIDE.md and the skills.
// A codemod edits the shard repo at `project` for the release's breaking changes and returns one line per change.
// This release changes nothing in a shard repo, so it is a no-op that keeps the hook's shape on file.

/** @param {Readonly<{ project: string, from: string, to: string }>} move @returns {string[]} */
// oxlint-disable-next-line import/no-default-export -- `update --pins` loads each codemod by its default export.
export default function codemod(move) {
  void move;
  return [];
}
