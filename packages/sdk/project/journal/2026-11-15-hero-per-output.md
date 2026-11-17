# The hero check and a source with several outputs

SA51: Open Plots is one source shard with 17 outputs, each wearing its own per-plot card. Its curated `hero.json` names
the shared `thumbs/card.jpg`, which no output carries, so building any output's shard file refused
`hero-not-in-product`. The carry check now applies only to the source's own product: when the product's
`shard.json` slug differs from the source manifest's slug, it is another output, and the line says the source's hero
is not looked for in it. The staleness check (stamp against content) still runs for every output.
