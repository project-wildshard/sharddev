# Bound simultaneous cold author compilers

The first pinned publication capture passed strict types and 763 cases,
but group-guest-loop's compilation beforeAll exhausted its existing
10-second setup cap: 11,294 ms observed, leaving seven cases unrun.
The default Vitest worker fan-out gives many cold AS compilers the CPU
at once. A real source-linked gate failed earlier on two nominal format
class identities; that is a separate local-workspace boundary, not this
pinned test failure.

Bound author test file workers to two. Every file and assertion still
runs; setup and case deadlines stay unchanged. This controls compiler
contention rather than granting the guest fixture more time. Publication
uses an immutable frozen install while live development aliases remain
untouched. The real full normal gate remains the verdict.
