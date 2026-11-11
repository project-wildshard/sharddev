# D5-4: the Template pin test names the prepared shardfile

Meta DOWNLOAD-THEN-C D5-4 and SHARD-PIPELINE SP2 (J259, J262). The 28
live shardfiles got their author preparation overnight: each pinned
shardfile was prepared in phone WebKit with this repo's `wildshard
prepare` (`39f299f`'s recorder) against an engine `7e3b3342`
preparation preview (renderer `49a01af1`), packed, uploaded to
api.wildshard.io and, for 26 of them, flipped live. Engine's shard pins
moved with them, so Template is now catalogue number 3,
`1993665d…`, `sdk: '0.3'`.

`test/ci/new-reference.test.mjs` fetches the Template shardfile that
engine pins and replays the door journey. It now names `1993665d…`.
Preparation adds `cook.json` version 3 and a program mount; it changes
no section, so the journey still agrees: 4 of 4 cases pass locally,
the pinned case in 1.7 s. The bytes are on the pins mirror release and
the API.
