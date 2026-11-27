The cold SDK install used pnpm 10.21.0 against the generated project's
10.34.9 pin. In its isolated home pnpm kept spawning another pnpm to
install itself. Keep the caller's already bootstrapped binary for all
packed installs. QA row 46 drives the generated project through the
verifier with a mismatched pnpm fixture that records any nested add.
