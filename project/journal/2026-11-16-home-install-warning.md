# Home-folder install warning

> Written by: Claude (opus-sdksplit1)

SDK-SPLIT SP-NE1 (NEW-SHARD-E2E F1): `npm install @wildshard/sdk` in a
folder with no package.json lands in the home folder's package, and
`npx wildshard` then runs that copy. The GUIDE already said to run
`npm init -y`; now `wildshard` says so too, on stderr, when its install
folder is the home folder and the current folder is below it. pnpm store
paths resolve to the folder that installed them.
