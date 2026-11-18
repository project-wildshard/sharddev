# 2026-11-18: one creature, three authors (ONE-FORMAT OF13)

GUIDE gets a "2c. Creatures" section: what a creature is (species row with its layers, strike rows, a look row) and
the dune jackal written three ways: SDK TypeScript with the kit's body, temperament and bite helpers, hand-written JSON,
and a 29-line Python script with no SDK. `test/one-creature-three-authors.test.ts` runs all three and checks they make
the same canonical shard-file bytes (Python prints them itself), that the rows admit unchanged, and that GUIDE shows
each file exactly as it is in `test/fixtures/three-authors/`.
