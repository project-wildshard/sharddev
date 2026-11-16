# Complete Template source layout port

> Written by: Codex
> State: source qualification, 2026-11-16.

Keep both original cases and every boundary/closure/metadata/map fallback
assertion. Public engine modules provide the actual sim closure, layout
checker and map reader; the SDK owns its boundary checker. Pastel is the
SDK-owned second map (the original Far Reach content is in its shard).

The first real run exposed the missing SDK layout policy. Retain every
engine layout rule and add only the actual SDK hero.json/card sources.
The complete original then passes2cases/0.212s, the full inherited source
compiler passes with pinned TypeScript7 and actual typed lint passes.
No assertion, source-code check, cap or compiler root is weakened.

J381 SKIP_CHECK=1: main-red deadlock, own focused tests and compiler pass.
No engine original removal or C2 tick; blocking/default admission waits.
