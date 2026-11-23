// SHARD-COMPAT SI7: the first-person arm maths a shard's Blender bake solves with (engine `game/systems/viewmodel/armRig`).
// The baked arms must bend exactly as the game's arms do, so the bake reads the shard's own engine module, not a copy.
/* oxlint-disable wildshard/no-reexport, wildshard/sdk-no-facade, oxc/no-barrel-file, unicorn/filename-case, import/export, wildshard/no-production-test-import -- SHARD-COMPAT SI7: the bake kit's arm rig is the shard's own engine module, re-exported until SI8 makes it a port */
export * from '@wildshard/engine/game/systems/viewmodel/armRig';
