# Give the cold compiler its measured preparation budget

Sky candidate run 42457510668 attempt 1 failed on the actual installed
author path: clang reached 53 percent before cmake was killed at exactly
120 seconds. Its ordinary retry passed the tool and then hit the separate
five-minute candidate job cap. Neither was a shard assertion failure.

The compiler build now has a bounded five-minute prerequisite budget.
Source digests, recipe flags, binary receipt and admission stay unchanged.
This work belongs to Ring 2 preparation. A quick candidate must restore
that exact dependency graph's verified cache and still build and play
the shard; increasing the candidate job limit is not the fix.

The real cold Linux Sky preparation and subsequent warm candidate are
the proof. No synthetic child-process timeout test enters a hook.
