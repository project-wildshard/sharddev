# Watch equals build, green again

`check:watch-build` skipped on every push until engine v0.1.21 put a hook v4 devserver client on its release. The day it
didn't skip, it went red three ways, one under the next:

1. `wildshard watch` bundled its own `three/tsl`, `three/webgpu` and `@wildshard/sdk/materials`, so the slice's sky
   `toVar()` met a node graph from another instance ("VarNode has no graph op"). They join `LIVE`.
2. Engine's `Game.watchFrames` gave every observer the id `harness.walk`. The dev hook's ground sweep holds one from boot,
   so the first part with a lamp or water threw "Duplicate system id". Fixed in engine `9ec1455a`; until the pin carries
   it, the watch page gives each observer its own id (pageEntry `ownObserverIds`).
3. The refused part disposed its holds, and the cache dropped the textures and geometry the next parts shared ("asset ...
   was not fetched"), so no revision ever framed and parity waited 180 s. The revision now holds what it fetched.

Stage 4 changed the lowering while the guard was skipping. The measured drift is the new baseline. The one gap seen, watch
drawing some grass cards dark, is SHARD-SOURCE AP16w.

The pond camera is not still: the slice's fireflies drift in the shader, and each page shoots them at another moment. Four
clean runs measured its share at 4.25%, 4.28%, 4.68% and 4.84% (the other cameras hold within 0.05%), and the 4.84% run
failed the v0.3.1 tag's pre-push. The pond baseline is the four runs' highest (3.499/255, 4.84%); the planted roof still
reads 5.58% there, red, and red at hut-front and door-lamp too.
