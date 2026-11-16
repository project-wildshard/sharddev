# Native compiler on Linux ARM64

RELEASE-BRANCHES RB6a2a: repo-kit PR #1 exercises the actual SDK on
its Linux ARM64 runner. The SDK ignored that platform's TypeScript
7 binary, so typechecking stopped before the real format-identity
assertion. Admit the native compiler and retain the frozen lock.
The real hosted SDK fixture verifies the compiler and type assertions;
the usual SDK push gate checks the current Mac installation.
