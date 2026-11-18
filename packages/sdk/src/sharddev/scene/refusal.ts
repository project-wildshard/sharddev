/** A scene the build refuses: which node, what is wrong and the fix, in one line (`scene: <path>: <problem>. <fix>`).
 *  Its own module so the creature compilers (`creature.ts`, `worldCreature.ts`) and the walker (`lower.ts`) share it
 *  without an import cycle. */
export class SceneRefusalError extends Error {
  constructor(path: string, problem: string, fix: string) { super(`scene: ${path}: ${problem}. ${fix}`); this.name = 'SceneRefusalError'; }
}
