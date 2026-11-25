// sdk 0.5.0 R1 (A7): a workspace package's peer range on another of the six must admit the one release version (D5).
// release/v0.5.0's packed install refused at the first minor: kit's `@wildshard/sdk` peer was `^0.3.2 || ^0.4.0`.
// `release-workspace.mjs pack` (ci's packed-install, on main and on a release) calls ownPeerProblems.

/** @param {string} text @returns {number[]} */
const parts = (text) => text.split('.').map(Number);
/** @param {number[]} a @param {number[]} b */
const compare = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

/** Whether `version` (x.y.z) satisfies `range`: `||` of comparator sets, each `^x.y.z`, `>=x.y.z`, `<x.y.z`, `x.y.z`
 * or `*` (space-separated, all must hold). A caret below 1.0.0 keeps its minor, as npm's does. Anything else throws.
 * @param {string} range @param {string} version @returns {boolean} */
export function satisfies(range, version) {
  const v = parts(version);
  return range.split('||').some((set) => set.trim().split(/\s+/u).every((comparator) => {
    if (comparator === '*') return true;
    const match = /^(\^|>=|<|=)?(\d+\.\d+\.\d+)$/u.exec(comparator);
    if (match === null) throw new Error(`own-peers: unsupported range part ${comparator} in ${range}`);
    const [, op = '=', at] = match, b = parts(at);
    if (op === '>=') return compare(v, b) >= 0;
    if (op === '<') return compare(v, b) < 0;
    if (op === '=') return compare(v, b) === 0;
    const ceiling = b[0] > 0 ? [b[0] + 1, 0, 0] : b[1] > 0 ? [0, b[1] + 1, 0] : [0, 0, b[2] + 1];
    return compare(v, b) >= 0 && compare(v, ceiling) < 0;
  }));
}

/** Each peer range a manifest holds on one of `own` that `version` does not satisfy, as a refusal line.
 * @param {{ name: string, peerDependencies?: Record<string, string> }} manifest @param {Set<string>} own
 * @param {string} version @returns {string[]} */
export function ownPeerProblems(manifest, own, version) {
  return Object.entries(manifest.peerDependencies ?? {})
    .filter(([name, range]) => own.has(name) && !satisfies(range, version))
    .map(([name, range]) => `${manifest.name} peers ${name} ${range}, which ${version} does not satisfy`);
}
