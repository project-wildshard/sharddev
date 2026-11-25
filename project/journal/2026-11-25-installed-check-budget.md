# The installed author's check gets 15 s

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25

bfbeecf7's `products (product)` went red on
`installed check --json gives a verdict`: spawnSync ETIMEDOUT at the 8 s
cap `run()` gives every installed command. t16 measured it: 5.5 s on
fast runners, 7.4 to 7.9 s on slow ones (9c658b97, 93515cf0, 216bd54a),
and that was before the 0.5.0 migration gate. It is the same two runner
speeds that cost Mossgate's walk (bfbeecf7). The spawn cap is now 14 s;
the two check tests get 15 s and every other test keeps 9.5 s, so a slow
build still fails where it runs. This came up because R1 (sdk 0.5.0)
needs a green main to cut from.

## Update: A9 made it slower

t16 then saw da490408 red on a fast runner. A9 (40c4f31a) made
`new --empty` a generated scene, so a build takes 4.6 s (was 2.1), check
8.1 s (was 5.5) and `--folder-only`'s two builds 9.0 s against 9.5. My
change, so my fix: budgets from the measured fast times times ~1.45 for
slow runners. Tests that build once get 12 s; check and two builds get
15 s. The cost is real (a scene runs its generator), and the bare scene
is what Jake asked for, so the budgets move, not the scaffold.

Later the same day the two check tests ran 13.2 and 13.9 s on CI
(90c3bb79) and timed out at the 14 s spawn limit (52d5c211). They now
spawn with 28 s and run under 30 s; every other test keeps its budget.
Why check grew from 8 s is not chased here: a plan row if it matters.
