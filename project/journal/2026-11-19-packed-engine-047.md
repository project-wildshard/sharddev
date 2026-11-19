# Engine 0.1.47 from a packed author install

Engine 0.1.47 declares wire ^1.2.0, but its creature fields are bound to
wire 1.2.0. Fresh installs can select newer fields and fail author
simulation with "animal.roadX has no binding". The root workspace
override only covers local development.

The author compiler chooses wire 1.2.0 for engine 0.1.47 imports. The
dev package also packs the engine's existing native proof worker with
those descriptors so the isolated worker uses the same bindings.
This path is selected only for engine 0.1.47.
