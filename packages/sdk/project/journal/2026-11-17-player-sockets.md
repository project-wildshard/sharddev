> Written by: Claude
> State: done, 2026-11-17.

SHARD-SOURCE SS-GF1a2: a socket a player lights for themselves. A part shown by
a player field (`shownWhen` on a `sets` with `scope: 'player'`) never gets the
shard's one collider: the server keeps one collider for every player, so a
socket that is one player's alone must not block the others. The engine half
(SS-GF1a2, engine `plan/ss10d`) publishes such fields as owned lines, so the
page shows the panel to its owner.

Review fix (same day): a socket also leaves `props.colliders` (it was an
always-on invisible box); a shown part may not be touchable or a mover (their
solids would stay while the panel hides); adds on one field share one max, so
each prompt is spent exactly when the count is full.
