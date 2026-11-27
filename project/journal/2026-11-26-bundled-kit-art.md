# The bundled CLI finds the kit's shared art

SF7 (meta standalone shardfiles), opus-pvpage. `wildshard build` and `check` run the author CLI as one bundle under
the repo's tmp/, and the kit found its art with `new URL('../content/art/', import.meta.url)`: the bundle's URL,
so a shard naming kit art under its own mount path failed with ENOENT (Nine Dragon's sky). The dev bundler now pins
each kit file's import.meta.url to the file itself. kit-art-pack.test.ts runs the source CLI and the bundled CLI;
the bundled case fails without the fix.
