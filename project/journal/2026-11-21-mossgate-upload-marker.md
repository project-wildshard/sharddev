# Mark the Mossgate upload

> Written by: Codex

> **State:** MT3 follow-up, 2026-11-21.

Lane: codex-tc48. The package marker change edaaebd4 is on main,
but the 2026-11-19 upload workflow patch was still held. Apply
its step-scoped fetch preload and copy the shared preload from
repo-kit. The helper delegates to markedFetch, which restricts
marker headers to Wildshard origins. GitHub Actions performs the
Mossgate staging upload; no local upload or credentials needed.
