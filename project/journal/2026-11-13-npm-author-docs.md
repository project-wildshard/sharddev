# Document the published SDK install

NP9 (codex-np9), from meta's NPM-PUBLISH plan: author-facing dev,
design, GUIDE and standalone setup docs now point at npm install
@wildshard/sdk (J315). The GUIDE's README-only placeholder claim was
stale after NP4. Keep a temporary pnpm fallback because NP7 still
owns removing the release's git dependencies and proving npm install.

The old standalone tarball proof remains labelled as historical
maintainer input; it no longer supplies the author install recipe.
SDK dependency specs belong to NP7 and are unchanged here.

Opus caught two concrete documentation hazards: unqualified npx could
fetch a different package after the npm failure, and removing the old
bootstrap made the retained maintainer proof incomplete. Use pnpm exec
and show the working pnpm fallback first; retain the historical
bootstrap under its own maintainer-only heading.

Validation: pnpm check and the normal commit and push hooks. The
existing NP9 row carries this coordinated work.
