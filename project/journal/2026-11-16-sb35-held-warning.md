# 2026-11-16: the upload CLI warns when the API holds it (SB35)

- meta STAGING-BUGBASH SB35 (opus-bugfix3): Mossgate went up at format
  0.1.0.1 to a staging serving 0.1; no pointer moved and the CLI said
  only "committed". api-server 92ce06a answers `held`; `placementLines`
  prints `warning: held: ...` first in the lines after the commit line.
  Test double: `state.held`. Tests in `upload-held.test.ts`.
