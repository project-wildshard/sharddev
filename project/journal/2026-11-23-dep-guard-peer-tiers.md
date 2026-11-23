# Dependency guard passes the engine-peer forwarders (opus-compat-w9)

- main 5aea408e went red on the lean-package dependency guard: SI4 headless and SI6 internal-engine forwarders
  import the shard's own @wildshard/engine, an optional peer of the sdk. The guard now passes those two sdk folders
  while the sdk declares the optional peer (PEER_TIERS, optionalEnginePeer); the production tree still refuses the
  engine and a lean export that reaches it through a forwarder still fails. Removal with SI8.
