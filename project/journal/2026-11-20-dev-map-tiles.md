# The author page serves its cooked map

> State: 2026-11-20. MSZ41b held with the local engine build.
> Written by: Codex

Dev uses the cook renderer on the completed folder. The output lives
under that revision's shardfiles path and the page is stamped only
after both sizes are ready. The next rebuild creates a separate pair,
so the old product and its map stay available until the swap.

The engine chooses the local images through the same map reader that
handles an uploaded shard. The product header and indexed files stay
as they were. The dev test verifies both PNG dimensions and the exact
original header.
