# Release branch CI

RELEASE-BRANCHES RB5 lets the release helper prepare a version on
its own ref while main keeps moving. CI now runs on release/**,
without cancelling an older release run. Existing tag publication
patterns stay in place.

The commit guard admits a release worktree only when its directory and
branch name match, including the nonshipping dryrun variant. Native hook
tests exercise both accepted names and a mismatched branch refusal.
