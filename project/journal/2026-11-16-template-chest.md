# The Template chest pays on E

> Written by: Claude (opus-brassgun17), 2026-11-16

TEMPLATE-E2E TC-E7: the old chest paid on walk-up through a region trigger because its prompt is an item action the quests never saw. Engine 0.1.32 raises an item action's `setsFlag` for the player whose use is accepted, so the chest's action now names `template.chest.opened` and the walk-up trigger is gone. `test/ci/template-chest.test.mjs` proves it on the built Template.
