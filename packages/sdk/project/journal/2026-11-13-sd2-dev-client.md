# SD-2: an installed `wildshard dev` fetches its client (2026-11-13, opus-sa15)

> Written by: Claude

- `wildshard dev` needs engine's devserver client, which this package cannot build. Engine now puts it on each release
  (HOW-WE-BUILD ENG-16); `dev` fetches `devserver-client.tar.gz` once from the release at the engine pin into
  `~/.cache/wildshard/dev-client/`. It works for users once the pin names a release that has one.
- The dev server answers `/shardfiles/<slug>/` from the product, and prints `?skipintro` (the bare page sits on the title).
- Proof: packed install outside every checkout, `new isle`, `dev isle/src`, headless walk of 8.5 m in 2.5 s.
