# CI21: the faceted author compiler test comes home

> Written by: Claude (lane opus-ci21port)

Engine's lift-pending `faceted-author-compiler` proves the SDK's
`FacetedGeometryBuilder` and `cullFacetedParts` keep engine's native
`LowPolyKit` bits, bounds, RNG stream and hidden-face culling, and that the
compiler runs under engine's native renderer import guard. The subject is
SDK code, so under J232 it lives here, driven against the public engine
exports (`world/lowpolyKit`, `world/geometryKit`, `host/immutable`,
`scripts/sim-node-loader.mjs`). Every case and assertion is unchanged.
