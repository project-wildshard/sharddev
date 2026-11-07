# The bin never ran installed

- `bin` pointed at `src/cli/main.ts`, and Node won't strip types under
  `node_modules`. So `wildshard` only ever worked in this tree, and an
  install died on its first line. Tests ran here too, so nothing saw it.
  `shardfile` had the same fault. `bin.mjs` installs format's hook first.
- SD-1's `new` and `build` wait for the lift. What runs now is the same
  outer edge on the commands we have: `pnpm pack`'s tarball, unpacked as
  an install would, beside only its declared dependencies, then a real
  product through `pack` and `upload`, and `serve` up and down. The test
  doesn't use `pnpm add` because a git dependency needs the network.
- The first try of the `serve` test hung when its bin was broken: a dead
  child never sends `data`. It reads the stream's end now, so a broken
  bin fails all three tests in under a second.
- The lift must keep `bin.mjs`, or whatever replaces it must do the same.
