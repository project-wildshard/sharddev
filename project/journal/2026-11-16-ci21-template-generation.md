# Restore full Template generation coverage

> Written by: Codex

> **State:** built/held, 2026-11-16; no land GO.

The original engine test/template-generation.test.ts moves with all
three original cases and assertions. It executes the actual Template
source, cold generation, verified cache hit, full JSON equality, all
173 asset identities/bytes, map pixels, one-chunk Vite build and the
unchanged config boundary. Generator imports use the defining SDK
checker (SA6/SA38, J319), which normal author lint already runs.

This exposed a real producer defect: world's module-level walls counter
survived independent generation calls, changing masonry GLBs. Reset the
seed at each synchronous build entry. An unchanged original case fails
when only that reset is removed; the other two cases pass. Restore it:
all three pass, file9.38s, cold generation2.41s/cache hit33ms. No
oracle,
fixture geometry, equality, cap or assertion is weakened.

Real compiler admission also found five source errors. Admit raw
authored state inside SDK compileDeclaredDecisionScripts
through its defining field schema, alongside creatures/rows. The boss
generator keeps its original imports and bytes; full-shard parsing is
inappropriate for that partial compiler input. Narrow Three material
arrays before disposing. Bracket two
userData index-signature reads. Compiler/typed lint pass with actual
Template/source fixture admission; no cast/ignore or copied producer.

SDK source manifest pins the original source blob and case titles.
Original engine file remains pending until destination land; no whole
TC48 credit. Review and final normal gates are recorded in meta proof.

Review follow-up: original HEAD and final actual boss Wasm are
identical:
b3ed14e34bbeafafab0b45ac8d43f3c5dae7eed0fe7960021f3286821098c8e4
(7963bytes).
Original engine test blob independently verified with git hash-object:
37a45eb198c9f59ffad7e77058e69c17f955dccd.

J206 follow-up ci21-template-generation-followup-0549: no MUST-FIX.
Original source/fixture assertions unchanged; source parsing belongs to
the same SDK entry used by normal project generation. Additional
malformed-state regression suggested, not required for this port.

Post-land continuation, November16: rebased onto original batch main
4d25fcda with frozen format0.7 install. Real compiler/typed lint and
5case Template cohort pass11.29s. Fresh first builds before/after match
all175asset names/lengths/bytes, shard/output/map and card hashes. The
baseline hero is fresh; successor source hash is stale. Supported
stamp-existing explicitly refuses changed source stamps. No source
stamp or image bypass made; actual fresh capture remains a MacBook step.
Original hosted43853379256 packaging refusal stays retained and valid.
The original five-branch GO is complete; this successor stays held.
