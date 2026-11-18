# Fold browser-only fallbacks in Node author builds

The linked Pine build hit the single-module guard when an inactive
browser fallback emitted a sidecar chunk. Carry the parked EV8 repair
into the build package that now compiles author configuration with the
SDK's Rolldown helper.

Fold absent DOM globals only for Node author configuration. The native
fixture reproduces the extra chunk before the repair, then executes the
Node branch with the repair and confirms that an active second module
is still refused.
