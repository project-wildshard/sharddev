/** FORMAT-PRUNE FP20: the species-program family, deleted. The engine refuses these client kinds at admission (engine
 *  b75b5f57d), so a product that emits one is refused at build, naming it: author plain `actors/species` and look rows. */
export const RETIRED_SECTIONS: readonly string[] = ['actors/species-programs', 'look/hull-book', 'look/rigged-hulls'];

/** Refuse the first retired section among `names`. */
export function refuseRetiredSections(names: Iterable<string>): void {
  for (const name of names) {
    if (RETIRED_SECTIONS.includes(name)) throw new Error(`Section ${name} is retired (FORMAT-PRUNE FP20): the engine refuses it at admission; declare plain actors/species and look rows instead`);
  }
}
