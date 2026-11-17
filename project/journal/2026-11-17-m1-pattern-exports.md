# Patterned source export guard

> Written by: Codex
> State: proved locally, 2026-11-17.

M1's kit geometry wildcard export made the SDK dependency guard read a
literal asterisk path. Expand patterned source targets over the existing
non-test source walker, preserving transitive engine dependency detection
and returning the public pattern key. Missing literal exports still fail.

The existing real-tree test failed first with ENOENT. Added nested pattern,
transitive engine, pure source, excluded test, and absent pattern coverage;
all four guard tests and the actual repository guard now pass.
