# SDK 0.4.26 packed consumer proof

The release-only Mirror Salt check upgrades its scratch dependency
graph to the SDK tarballs. The published 0.4.25 consumer has a patch
for that exact dev package version. pnpm refused the scratch install
because the replacement tarball could never use the old patch.

Keep patches for other packages and keep matching version selectors.
Load the engine and Vite declarations in the dev proof itself, where
the old Mirror Salt patch supplied them for a fresh consumer.
