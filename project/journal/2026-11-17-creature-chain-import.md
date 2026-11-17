# Imported creature chain names

> Written by: Codex
> State: ONE-FORMAT CC10a2a source, 2026-11-17.

The public scene/creature-import helper maps actual source GLBs through a
custom defining chain map or the Mixamo/Rigify biped presets. It retains
mesh attributes, skin weights, actual clip targets and attachment parents.
A non-joint armature becomes the canonical body with remapped skin indices
and inverse binds. Missing, duplicate, ambiguous or detached chains name
the chain; translation-only unit bind and32-joint limits remain explicit.
Input bytes stay unchanged. No runtime pose/controller or clock is added.

The bounded rig reader is shared with existing rest/motion intake. A
shared writer retains lossless Meshopt compression with its encoder;
initial real import controls exposed the missing encoder dependency.
The skin metadata emitter now writes the complete actual ordered skin
joint list: parent-child pairs did not match the engine binder. Existing
compiler output and new real-GLB metadata controls cover the correction.

SDK-SPLIT moved the project compiler into packages/build. The ordinary
project proof invokes the public import in shard.config.ts through
ctx.cached declared inputs, and returns its bytes in generated output
assets. An initial direct fs config was correctly refused and replaced,
without bypassing the capability boundary. The original GLB and JSON
source remain exact after build/admission. SDK aliases/override use
newest registry format0.23.0 (published during verification); kit assets are the following CC10a2b row.

Exact unit/build/types/lint and full push proof are in
root tmp/codex-te2e/cc10a2a-*. Meta records final source/hosted status.
The public export is bake-kit tiered and its generated API page is current.
