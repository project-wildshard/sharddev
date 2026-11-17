# Watch observer ids, the page patch goes

> Written by: Claude

Engine 0.1.22 carries 9ec1455a: each `game.watchFrames` observer gets its own system id. The watch page's
`ownObserverIds` patch (AP16) only covered engines up to 0.1.21, so with the pin on 0.1.22 it goes. `check:watch-build`
stays green on the new pin (hut-front 2.146, door-lamp 4.241, hut-back 0.472, pond 3.369).
