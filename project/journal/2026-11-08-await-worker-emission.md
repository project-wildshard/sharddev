# Wait for the worker emitter

The dependency-weight plan replaces engine's second bundler.
Rolldown emits its service-worker bundle asynchronously.
The author catalogue must wait for that output before returning.
Otherwise a caller can observe a completed command without sw.js.

The catalogue already runs in an async entry point.
Its one optional service-worker call now uses await.
Await also accepts the synchronous emitter in the pinned v0.1.0.
The SDK pin and every product recipe remain the same.

This is the consumer seam for engine NM4.
No producer or renderer implementation changes here.
No cache key or hash is replaced by a fabricated value.
The worker still hashes the bytes its bundler actually emits.

The real sharddev typecheck passed in the shared checkout.
Engine's real emitter and worker lifecycle checks passed 41 cases.
Its native save-epoch proof passed four Chromium/WebKit cases.
The kit browser smoke also passed against emitted web bytes.

These are existing outer-edge checks rather than added hook tests.
Engine publication remains reserved to the release lane.
The engine source commit will therefore remain local for now.
This SDK change is compatible before that engine release.

Only the catalogue line and this journal belong to this change.
The preparation and entry-program changes belong to another lane.
They are left in place and excluded from this commit.
