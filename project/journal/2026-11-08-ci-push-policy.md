# Finish push verdicts and scope Ring 2

Jake J193/J194: active push CI now finishes; only PR runs cancel.
The main CI summary names its target SHA and paginated included commits
since the previous finished, non-cancelled push. It does not give an
intermediate SHA an independent green verdict. Summary reporting is
informational; every existing check keeps its blocking behavior.

Ring 2 author now runs for its own source, test, asset, dependency,
configuration and workflow paths on main, plus nightly at 03:00 UTC and
manual candidate dispatch. The previous tag trigger was replaced:
GitHub does not evaluate path filters for tag pushes. All candidate
inputs and native checks remain.

Actionlint passes. Parsed before/after job inventories retain all four
main CI jobs and the Ring 2 job with every original step unchanged.
Normal commit and full push hooks remain enabled. No pins, runtime
source, visibility, credentials, test caps or ratchets changed.
