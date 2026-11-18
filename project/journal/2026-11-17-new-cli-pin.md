# `wildshard new` pins a cli npm has (TEMPLATE-E2E TC-NE5)

- opus-sdksplit6: a starter made on sharddev main at 0.3.9 pinned `@wildshard/cli` 0.3.9, which npm never had (the
  cli first shipped at 0.4.0), so `pnpm install` failed. `releasePin` now pins the sdk and the cli at the running
  sdk's version only when npm has both there, else at the newest release npm has both at; offline, the version stands.
- `newProject-pins.test.ts`: unit cases for the choice, and one that asks npm and fails if today's pins are not on it.
