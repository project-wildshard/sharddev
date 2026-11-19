# Mossgate's staging slot follows the template

Meta MOSSGATE-ZONE MZ3 (J452, J453). The template's gameplay landed
on main (TR-12a and TR-12b) while staging kept serving Mossgate rev 3,
the scene with an idle golem, and nothing noticed: Jake found a statue
for a boss on his phone. Every shard repo has a `publish.yml`, but
Mossgate's source lives here, in the SDK, and nothing published it but
a lane by hand.

`mossgate-slot.yml` does what a shard repo's publish does, for the one
shard sharddev owns: a main commit that touches
`packages/sdk/src/shards/mossgate/**` builds it, prepares it in phone
WebKit and uploads it to staging with that commit and the next patch
version. Then the drift check reads staging's Mossgate commit from
`/api/catalogue/shards/mossgate` and fails unless it contains the
template's last change. The daily schedule runs the drift check alone,
so a publish that failed or never ran shows red the next morning.

sharddev now gets the org's `WILDSHARD_API_KEY` and
`WILDSHARD_CREATOR_PRIVATE_KEY`, as the shard repos do; the ci step that
waited for the key (SHARD-DELETE DEL6) now prints its account.

The first run (44581702711) built and prepared Mossgate on hosted Linux
in under two minutes, then upload refused it: the hero was unchanged
since 0.1.1, because that commit touched only the workflow. A `slot`
job now runs the drift check against HEAD first, and build and upload
run only when staging's Mossgate lacks the template's last change.
