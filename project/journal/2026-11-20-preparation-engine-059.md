# Use engine v0.1.59 for SDK preparation

An empty preparation input falls back to the SDK's installed engine.
Driftwood's older preparation client stalled in phone WebKit on both
Linux and macOS. Engine v0.1.59 includes the native AAC fix
`591aefb5e0` and has its preparation archive on the released tag.

Pin the author packages to that engine and its format 0.63.0. The
preparation client test checks the default tag, archive URL and cache.
The matching format makes three test-fixture casts redundant; remove
them so the normal lint gate can check the shared types directly.

Driftwood keeps an explicit 0.1.54 runtime override. Map that affected
version to v0.1.59 for preparation so an empty publish input works after
the SDK upgrade. The devserver client still follows the runtime override.

Port v0.1.59's shared transcendental functions into the author table.
The parity check compares both the function digests and their source.
