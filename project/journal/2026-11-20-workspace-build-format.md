# Workspace builds use the current validator

> State: 2026-11-20. SDK patch held for the format pin.
> Written by: Codex

The Mirror Salt checkout ran dev with a linked SDK and format. Its
build command preferred the workspace's existing compiled bin, whose
inline validator predated race laps, riding rules and step feedback.

Both CLI dispatchers now use a fresh engine-free compiler result inside
a workspace. Each process owns its scratch bundle. Published packages
still ship the prepack-compiled bin. The CLI test checks the emitted
race rows and quest feedback with both entry points.
