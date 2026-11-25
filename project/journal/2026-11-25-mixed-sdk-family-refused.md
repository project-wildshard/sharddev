# check refuses a mixed sdk family (sdk-migrate F5)

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25.

t16 found this on the R2 outside-author journey. Moving `sdk` and `cli`
to 0.5.0 by hand while leaving `dev` at 0.4.31 left `wildshard` on
dev's 0.4.31 bin: dev ships a `wildshard` bin too, and it won the
link. That old bin has no migration gate. So `dev` ran, `check` failed
on the old layout without naming the migration, and `status` was an
unknown verb.

CP18's pin check already refuses a format or engine pin that differs
from the sdk's. It now also requires every family pin (sdk, the
sharddev alias, cli, build, dev, upload, kit) to be the installed sdk's
own version. A mismatch names the pin and says to run `wildshard
upgrade <version>`. All 11 rolled repos pin one version throughout, so
none goes red: patch class.

The limit: an old dev can't learn this. In t16's exact case, dev
0.4.31 is the one running and it has no such check. What protects that
repo is `wildshard upgrade`, which moves the whole family in one step,
plus this check for every mix from 0.6.0 on (dev new with sdk old, or
the reverse). The fixture sdk manifests in pinCheck's suite carry no
`version`, so the old tests are unchanged.
