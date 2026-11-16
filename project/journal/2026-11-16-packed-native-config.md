# Retain native compilation inputs in the SDK archive

> Written by: Codex
> **State:** built, 2026-11-16; packed native repeat proof in progress.

Real Pine and Driftwood builds from the actual SDK/kit archives fail before
generation: packed src/tsconfig.json extends kit/tsconfig.json, which the
package file list omitted. Source-checkout builds hid the missing input.

Ship that exact existing compiler configuration. Release archive checking
now follows relative extends references in every packed tsconfig and
refuses a missing parent. No compiler policy, content, geometry or world
behavior changes. Repeat the normal native builds from corrected archives;
do not fill missing package files from a live checkout.

Also validate packed project references: current engine consumers exposed
a missing root test/tsconfig.json reference after the extends input was
fixed. Compiler input closure includes both forms.
