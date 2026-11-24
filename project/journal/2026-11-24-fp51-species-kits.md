# FP51: species parity keeps its own kits

> Written by: Claude (opus-prune3)

`species-rows.test.ts` read engine's bear and boar kits through the engine package, which kept engine's kind
literals alive (FORMAT-PRUNE FP51). The two native rows are now a fixture beside the test, dumped from engine
`c6b51acf0` (the same bytes as the pinned engine), so engine can move its kits into its own test fixtures.
