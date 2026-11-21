# Use engine v0.1.59 for SDK preparation

An empty preparation input falls back to the SDK's installed engine.
Driftwood's older preparation client stalled in phone WebKit on both
Linux and macOS. Engine v0.1.59 includes the native AAC fix
`591aefb5e0` and has its preparation archive on the released tag.

Pin the author packages to that engine and its format 0.63.0. The
preparation client test checks the default tag, archive URL and cache.
The matching format makes three test-fixture casts redundant; remove
them so the normal lint gate can check the shared types directly.
