# Current synthetic accounting fixture

> Written by: Codex
> State: ONE-FORMAT CC10a2b2f integration, 2026-11-17.

The format24 full SDK gate passed1266 tests and refused one older
synthetic client-plan transport fixture. Its omitted epoch meant1,
while the newly published model requires2. The fixture explicitly
describes the current model now; it is labeled synthetic and carries
no captured runtime measurement. The same real output path additionally
proves omitted and explicit epoch1 readings still refuse. Admission,
accounting policy and production measurement evidence stay authoritative.

The SDK source also crossed the peer0.4.0 release merge while main
advanced. main-push cannot replay a merge; a normal merge retained both
lanes without rewriting either history. The combined tree receives the
normal full push gate, with no hook bypass. Logs live in root
tmp/codex-te2e/cc10a2b2a-*. Meta records the exact qualified source SHA.

The next gate phase also found the same old synthetic cost in the build
fixtures. The shared clientPlanRuntime fixture now owns the current
epoch for SDK/build/dev cases, and copied-runtime tests reuse it. Actual
production readings are untouched; source-inventory refusal retains its
original named guard instead of being masked by a stale synthetic cost.
