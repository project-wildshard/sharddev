# Retain actual CLI phase evidence on a map timeout

SDK d40c91a CI 42780612229 failed before reaching the new sky codec.
The installed map repeat-build command hit its unchanged 8,000 ms
spawn bound (8,035 ms observed); four other map cases and all other
jobs passed. The child stdout containing actual compiler phase timings
was hidden behind assert.ifError. Do not rerun this workflow or call
the codec red. The existing 9.5 s map case and 8 s child limits stay.

One normally admitted quiet local file passes all five cases in 12.13 s:
new 1.058 s, first build 2.605 s, repeat 2.480 s, pack .385 s,
refusal 1.419 s and selected build 2.529 s. The timeout is not reproduced
locally and no root or performance repair is claimed. Local Docker is
unavailable (no daemon socket); no service was started or reset.

Retain actual wall/exit and existing compiler phase lines for each CLI,
and the child's complete stdout/stderr before its original error is
asserted. This is a diagnostic source forward, not a blind workflow
retry, added timeout or root-fix claim. The independent new codec runs
before the existing map step so a map failure does not erase its own
verdict. Every map case, command, image, pixel, refusal and byte check
continues unmodified. Follow any future map red from these actual facts.
