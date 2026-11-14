# 2026-11-13: watch drives engine's dev hook (SHARD-SOURCE AP5)

> Written by: Claude (lane opus-ap5)

J347 (Jake, 23:00 Cancún): engine is the deployed MMO client and server only; dev and authoring tooling lives here. The
first `wildshard watch` (AP6, opus-ap1) leaned on a dev scene host in engine that owned the transport (server-sent events
plus fetch), the wire and the part swap. Now all of that is sharddev's:

- `watch/protocol.ts`: the wire. One `WatchState` per revision on a WebSocket (`/__wildshard_scene/socket`); parts,
  geometry and rasters by HTTP GET, immutable by key. A part's lamps and water are the shardfile's own rows (`lampRows`,
  `waterRows`, lifted out of `scene/shardfile.ts`), so the page draws them as a baked shard's are drawn.
- `watch/socket.ts`: a small RFC 6455 server, text frames out only, so no new dependency.
- `watch/page.ts`: the page script `watch` bundles and injects into the page it serves. It owns one scope per part, the
  decoded-asset cache and the swap order (fetch and decode the whole revision first, then swap each part, then drop the
  gone ones), and drives engine's five-call dev hook. It also replaces the old reload poll: a new shell number reloads.
- The look's day keys (sky, fog, sun colour, ambient) now go live through `setLook`; only a ground, spawn, grade or sun
  direction change rebuilds the shell.

The hook is versioned twice: the page script refuses a hook of another version, and `watch` refuses a devserver client
whose `build-flags.json` names another `devHook` (engine's app build writes it), so an sdk and its engine pin move together.

Review fixes: the page script records a part as soon as the hook draws it (a collider failure no longer leaves it
unrecorded, so the next revision replaces it rather than adding it twice); the timing counts a revision only when every
part landed; the server's error and the page's own are separate fields. A fog kind change (linear against exponential)
now rebuilds the shell, since engine's live look keeps its fog kind, and a first sync whose look the page can't take live
says so. Each shell writes `window.__wsShell` before the page script, so a page from an old shell reloads on its first
message. The socket refuses another origin and upgrades after close; a bad message is reported, not thrown.
