# Release branch session brief

RELEASE-BRANCHES rolls out the shared brief from repo-kit. Version
release refs and matching worktrees are expected, including dry runs;
arbitrary release refs still warn. Cleanup and owner reporting retain
the same shared implementation. This is tooling only.

The normal push gate also exposed a provenance fixture that assumed
system temp was outside Git. Its no-checkout case now stops discovery
at the fixture's parent, so repo-owned scratch keeps the same refusal.
The prior environment is restored after that isolated test case.
