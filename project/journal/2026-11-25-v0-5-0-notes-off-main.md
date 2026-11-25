# The v0.5.0 notes come off main

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25

Jake handed this session the rest of the sdk 0.5.0 plan (A7): "your in
charge for 0.5.0 etc and finishing this whole plan". By hc with t16, the
session that wrote the plan: R2 (Driftwood) is t16's; R1, R3 and R4 are
mine.

R1 would have refused. 440fee25 wrote `## v0.5.0` into CHANGELOG.md on
main, and repo-kit's `release-branch.mjs --prepare` throws "notes for
this version already exist" when it finds one: prepare writes the section
itself on the release branch, from `--notes`, with each bullet capped at
142 characters (the old ones ran to ~200). The section comes off main;
the notes are t16's four bullets plus one for `new --empty`. The
CHANGELOG header said to write notes on main by hand and that
`release.sh` never reads the file, both stale since the release-branch
train, so it now says how the train works.
