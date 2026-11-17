# Release the SDK and kit together

> Written by: Codex
> **State:** built, 2026-11-16; first kit publication still needs npm authentication.

SDK-SPLIT D5 requires one tag and version. The earlier M1 content package
had an independent 0.1.0 version, and the existing npm job published only
the root with npm, leaving its workspace dependency unresolved.

Release stamping now aligns kit with the root version. pnpm packs both
archives; the verifier reads their actual manifests, checks every concrete
public export/bin, refuses unpublished production dependencies and proves
that SDK pins the matching kit. One release tag publishes kit before SDK.
The bootstrap workflow can exercise both existing-package publishers.

The actual source archives pass: kit 5.8 MB and SDK 2.4 MB, all public
paths included and the workspace kit dependency rewritten to the exact
version. Stamping is idempotent and actionlint passes. Normal SDK types
still need the M1 engine release; no type assertion was relaxed.

The registry reports no @wildshard/kit package. npm whoami returns E401,
so the machine cannot perform its initial authenticated publication or
publisher configuration yet. This is an observed release prerequisite,
not a reason to hold source work or the hero's SDK land.
