# Node author bundles fold browser-only fallback imports

HOW-WE-BUILD EV8c's real linked Pine build failed the existing single-module
config guard. Vite emitted a browser download-failure chunk from a Node author
input, despite codeSplitting false. The same source built with absent DOM
globals folded before dependency discovery produces one executable chunk.

The Node author compilation now lives behind bundleAuthor. It uses Node's
existing absent document/window globals as compile-time facts. Browser/runtime
build profiles and the download/reload implementation remain unchanged. The
single-output and single-JavaScript-module checks remain; the caller retains
its executable-import boundary and source/input capture.

A native compiler fixture fails first when a browser-only dependency emits a
companion chunk. The repaired Node profile never loads that inactive branch,
executes its generator and returns the expected value. Making that dependency
active still refuses the multi-module result. The actual linked Pine build
then passes (61.6 s product, 64.8 s wrapper); Driftwood also passes (42.5/45.6 s).
These are pass/fail run walls under shared load, not performance readings.
Dunes and Sky also passed the linked graph. The final graph, cache edit/rebuild,
local checks, hosted qualification and batch review are recorded in the plan.

Review repair: the native author test now uses the established owned
scratch fixture and closes its empty parent after the run, instead of
recreating an unclaimed hard-coded lane directory.
