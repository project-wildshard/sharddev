// SHARD-COMPAT CP18b (meta): the Node entry for the shard test harness. Plain Node cannot load engine's simulation
// on its own: engine ships TypeScript under node_modules with extensionless imports, and its physics package
// (`@dimforge/rapier3d-simd`) names only a `module` entry. Engine's own loader (scripts/sim-node-loader.mjs) handles
// all three, so a shard's tests run
//
//   node --import @wildshard/dev/test/node --test test/*.test.mjs
//
// and then import `@wildshard/dev/test/proof` and `@wildshard/dev/test/quest` like any module. Registering the hooks
// here, at startup, is what makes them apply: a hook registered by a sibling static import is too late for the
// imports Node has already resolved.
// oxlint-disable-next-line import/no-unassigned-import -- importing the loader registers its hooks; that is its whole job.
import '@wildshard/engine/scripts/sim-node-loader.mjs'
