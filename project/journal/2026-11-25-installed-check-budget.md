# The installed author's check gets 15 s

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25

bfbeecf7's `products (product)` went red on `installed check --json gives
a verdict`: spawnSync ETIMEDOUT at the 8 s cap `run()` gives every
installed command. t16 measured it: 5.5 s on fast runners, 7.4 to 7.9 s on
slow ones (9c658b97, 93515cf0, 216bd54a), and that was before the 0.5.0
migration gate. It is the same two runner speeds that cost Mossgate's walk
(bfbeecf7). The spawn cap is now 14 s; the two check tests get 15 s and
every other test keeps 9.5 s, so a slow build still fails where it runs.
This came up because R1 (sdk 0.5.0) needs a green main to cut from.
