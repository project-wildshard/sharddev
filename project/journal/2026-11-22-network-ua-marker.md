# Proofs mark the network UA, not only the page

> Written by: Claude
> **State:** done, 2026-11-22 (meta METRICS MT16, lane mini-mt16).

METRICS MT16's hourly Cloudflare audit on staging found 444 unmarked
HeadlessChrome requests in one minute (19:56 Cancún), all from the mini:
a meta proof script (mz30-staging-two.mjs) run from this root through
`packages/dev/scripts/browser-playwright.mjs`. That loader's marker was a
copy of engine's from before `59222e89e`: a context with no device UA
marked only `navigator.userAgent`, so every network request (`/`, chunks,
`/sw.js`) went out as plain HeadlessChrome and broke "no unmarked
automation on staging for an hour".

`wildshard-browser-marker.mjs` is now engine's `scripts/browser-actor-marker.mjs`
at `c84c3f06c` (the network UA fix plus the CDP default-UA probe), with
sharddev's own import of the agent token. A local check (a server recording
the UA of `/`, a fetch, `/sw.js` and the worker's own fetch) reads every
request marked in Chromium and WebKit.
