# Preserve the cook inputs across the Linux fixture wrapper

> Written by: Codex
> State: hosted red reproduced, 2026-11-16.

Hosted run44004982556 check reached the actual composed protocol. Both
successful cook/activation cases failed with ERR_ACCESS_DENIED while the
five refusal/status cases passed. The macOS local seven-case proof passed.

runJob supplies only PATH, production mode, its bounded cache path and
cook limits/renderer. The Linux fixture's sudo and setpriv --reset-env
removed those values. Spawn-part encoding fell back to the home cache;
its cleanup correctly hit Node's filesystem restriction. Keep exactly
those five runtime values across sudo and omit the conflicting reset-env.
The child still receives no parent cook credential, uses the same real
network namespace, uid/gid drop and Node read/write grants and limits.
No released runtime code or sandbox grant changes.

The original Linux functional cases are the regression; rerun all seven
locally and qualify them on hosted Linux before landing. Cancel the
already-red owned run and retry the same plan land through normal gates.
