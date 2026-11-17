# Keep the output check's sample with its owner

The NM5 engine package audit used a real Git dependency install.
The engine's test tree is not a producer runtime dependency.
Removing it exposed three output-product cases in this SDK.
They reached into node_modules for engine's pixel KTX2 fixture.
The other 767 author cases passed against the trimmed package.

Those three checks test the public output emitter and validator.
Their payload and envelope assertions should stay intact.
The SDK now owns an exact copy of the 132-byte sample.
Only the fixture's input path changes in the existing test.
Its bytes, dimensions, GPU cost and padding stay the same.

An existing SDK checker texture was tried first.
That larger sample correctly failed the fixed GPU admission costs.
It is not substituted and no cost assertion is weakened.
The small pixel sample preserves the original test contract.

The canonical output-product file passes all 16 cases in 2.26s.
A fresh SDK source export installs engine from its local Git SHA.
That install uses pnpm 10.34.9 and the real package files filter.
The entire SDK check then passes with the owned sample.
All 164 author files and 770 cases run and pass in 13.19s.
Typechecks, lint, formatting, kit checks and ask checks pass too.

This is an existing outer-edge suite, not an added hook test.
No engine internal function is mocked or asserted by this fix.
No product recipe, renderer, visual output or game asset changes.
Only the test fixture, its input path and this journal are committed.
Other lanes' preparation and entry-program files stay untouched.
Engine publication remains reserved to the release owner.
