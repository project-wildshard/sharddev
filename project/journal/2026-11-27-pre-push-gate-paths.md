# The pre-push runs its two ref gates again

The lean layout moved src/scripts/ but the pre-push still tested
`$top/scripts/format-api-gate.mjs` and `$top/scripts/retired-vocabulary.mjs`
before running them from src/scripts/, so the format ceiling (CP3) and
the retired-vocabulary refs gate (FP58) quietly never ran on a push.
Both test the path they run now; both pass on main (4dff5c8a over its
last five commits). .githooks/hook-paths.test.mjs refuses a hook naming
a script that is not there, or testing one file and running another.
