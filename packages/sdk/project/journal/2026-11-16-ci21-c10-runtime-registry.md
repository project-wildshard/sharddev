> Written by: Codex
> **State:** compiler registry aligned, 2026-11-16.

The normal pre-push correctly refused the new explicit runtime-files
compiler root until its existing CI21 admission registry named it too.
Register this preexisting runtime test as a compiler-support/control root;
its four cases now pass actual pinned native typed lint as well as Vitest
and the author compiler. No source inventory or compiler gate is weakened.
C10 ownership and the builder-path test SHOULD stay with codex-pins.
