# CI21: the SDK half of engine's graph lift tests

> Written by: Claude (lane opus-ci21port)

Engine's thirteen lift-pending graph tests each mixed two promises: engine
compiles a GraphIr into the right GLSL and live uniforms, and the SDK's
`graph()` authors that IR. Engine can't import sharddev (J65), so under
J232 each half goes to its owner. `test/graph-author-ops.test.ts` holds the
SDK half, one case per engine file: the budget a GraphMaterial keeps, the
toon and optional-attribute IRs authored byte for byte (engine now compiles
those literals, so this is the link between them), flat-varying and
non-finite-default refusals, the fog/atmosphere, instance, wind and Gerstner
ops, the shadow and caustics flags, and the lossless linear KTX2 bake of
numerical channels. Assertions are the originals, unchanged.

Map: project-wildshard-meta docs/plans/test-coverage/CI21-PORT-MAP.json.
