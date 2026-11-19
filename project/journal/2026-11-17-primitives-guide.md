# 2026-11-17: the primitives page and report line (ONE-FORMAT OF18a, OF17c)

opus-of-m4. Format 0.29.0 carries the primitive table (`@wildshard/format/primitives`). GUIDE section 8 gets one page
per family, and a test holds the pages to the table; `wildshard check` prints the primitives the server will derive.
This branch pins format 0.29.0, which engine 0.1.35 does not typecheck against (format 0.27's leap move and retired
words), so it waits on the engine's format pin (MEMORY-GATES MG8) before it lands.

Landed 2026-11-18 by opus-sdkpin on format 0.41.0: the table now switches population, elites, boss, boss.arena,
patrol, held.*, water.sea, grapple and portal on from sections (a family may list several triggers), so their pages
name those sections, and the Template-style fixture reports `collision, plumbing, population`.

OF18b (same lane): the riding page carries an SDK TypeScript example (`src/sharddev/guide/riding.example.ts`,
type-checked with the sdk) and its hand-written JSON rows; the test parses every section-8 JSON block with the rows
schema and rules, holds the ts block to the file and the JSON to its rows, and a planted bad gait fails.
