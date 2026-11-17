# Prove passes the output's sections (opus-ss16q, 2026-11-16)

- `wildshard prove` and check's prove step called the engine's `proveAuthorSimulation` without the output's sections
  (engine TC-NE5b added that argument), so the engine read every Wasm as ABI 0 and the Template's v1 decisions refused
  any tape with `Import signature outside ABI`, on main and on the 0.1.31 pin alike. Both now pass them, and validate's
  source path passes them to `validateSimulation`. `test/prove-output-sections.test.ts` plays a 20-tick stand-still tape
  on `_template` to its fact check (red before).
- Next on the same tape, with the checkpoint at tick 1: `restored regional suffix diverged in
  entities.4.1.motion.yaw` (a few float ulps), an engine restore bug; GUIDE's known list says so.
