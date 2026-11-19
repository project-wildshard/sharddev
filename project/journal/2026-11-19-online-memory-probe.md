# Run the shard memory gate on a local world

STR10 starts the same Node world as the author dev command for the
exact built folder. The preparation client keeps its renderer and
receives a signed world document on the same origin as the product.
The world reads verified product bytes and uses temporary local saves.
The port, child and saves retire when the gate completes or refuses.

The CLI requires both control and a worker-free online boot from
the engine meter. It preserves the existing Chromium memory verdict
and adds the route and worker evidence to the report.

The first local call reached control on the built Template with
`boot: online` and `serverWorker: false`. Its matched comparison
recorded 676 MB standalone and 774 MB online Chromium peak. The
standalone arm started a server worker. That pair does not establish
a peak reduction. The last 2.5 seconds of samples at control had
median renderer plus GPU footprint of 671 MB standalone and 603 MB
online. STR10 remains open for shard CI.

Published engine 0.1.48 carries the dev server bundle but not the
meter's `boot` and `serverWorker` fields, so the probe refused every
online boot on it. The preview server now records what the page asked
it for: the release document (the page chose the online path) and any
`serverWorker-*.js` script (an in-page server). The meter's own fields
win when the engine has them; otherwise these decide. That lets a shard
repo run the online probe on the engine it already pins.
