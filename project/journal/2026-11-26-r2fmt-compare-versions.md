# Validate authored versions before upload

RL2 checks the handwritten product index against the source package before
packing. The upload CLI compares those versions with its upload argument
before it contacts the API. The check reports every value it saw.

With format 0.81.0, the CLI requires an authored shardVersion before it
contacts the API. Build checks the source values before changing the output.
The async contract uses the exact API commit that implements the same check.
The composed local proof uses the new engine sources and the packed CLI.

The installed CLI proof authors matching versions beside the built product
and runs the signed upload from the fixture project. This keeps the test on
the normal packed CLI path with all three declarations.
