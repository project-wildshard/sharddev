# Use the same Sharp decoder throughout the author tools

NM7 reproduced two Sharp versions in the actual dependency tree.
The CLI loaded libvips 1.2.4 and 1.3.4 in the same process.
macOS reported duplicate GNotificationCenterDelegate implementations.
The direct pin now matches ndarray-pixels at Sharp 0.35.5.
Engine uses the same pin in its own matching change.

The real upgrade exposed an actual decoder identity failure.
Sharp moved its CommonJS implementation to dist/*.cjs.
Its public sharp.node export now wraps a versioned native addon.
The old resolver required lib/libvips.js and a bare binary export.
Six existing identity cases failed before the adapter was updated.

The identity derives module suffixes from Sharp's resolved entry.
It resolves the native package through its public package export.
Its lib folder must contain exactly one native Sharp binary.
The public wrapper and concrete addon must equal Sharp's bound export.
Native containment and bounded library-byte hashing remain mandatory.
The wrapper package's JS and metadata now enter the fingerprint too.
Missing, ambiguous, mismatched and byte-changed artifacts still refuse.

All six identity cases pass in a 0.462-second file run.
Existing image/asset suites pass ten cases across two files.
The real outside-author input proof passes eleven cases in 31.17s.
Those cases build, edit and readmit actual images and map pixels.
Every individual outside-author case stays below ten seconds.
The engine's four real atlas cases also pass.

The full SDK check passes 770 author and 34 kit cases.
Typechecks, lint, formatting and ask checks pass unchanged.
The duplicate native-library warning is gone from that full check.
pnpm why reports only libvips 1.3.4 and Sharp 0.35.5.
The normal pruned SDK store is 810460 KiB; no global cache is deleted.
Other lanes' preparation files remain outside this commit.
