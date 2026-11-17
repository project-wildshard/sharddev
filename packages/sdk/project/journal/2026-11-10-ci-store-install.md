# Prove the actual store layout on hosted SDK jobs

J230 requires the global virtual store on hosted CI too.
The prior plan incorrectly treated CI classic mode as sufficient.
Pnpm 10.34.9 disables GVS when its own ci option is true.
The runner CI environment must remain true for the actual test profile.
These commands change only pnpm installer configuration.
They select ci=false and enableGlobalVirtualStore=true explicitly.
The ordinary pinned branch keeps its frozen lock requirement.
The pre-existing candidate branch alone remains non-frozen.
No event, authentication or candidate selector is changed.

Every existing SDK check and author test still runs.
No timeout, case assertion or file inventory is reduced.
The metadata-only source had one hosted map-author red.
Its original eight-second child clock expired before baseline assignment.
The later undefined-baseline comparison follows that timeout.
The focused five cases pass locally under their original clocks.
Parent-only CPU samples do not establish its worker cost.
This layout change does not claim that timeout root is fixed.
The subsequent full CI verdict must still be inspected.

The existing setup-node cache covers pnpm store content and links.
Its dependency hash now includes workspace configuration as well as lock.
That separates this graph key from the old classic-only lock key.
A restored-cache job still validates its frozen installed graph.
A named boundary check asserts the actual registered links directory.
Valibot, Vite and the engine must resolve into that directory.
The check refuses a classic checkout rather than trusting a flag.
The CI environment remains visible in its bounded path receipt.
No credentials or environment contents are printed.

The exact CI-shaped frozen install passes in the private SDK clone.
The layout assertion resolves all three packages into global slots.
The same assertion refuses the owned classic-layout engine clone.
Local evidence is not presented as a hosted cache hit.
Cold hosted install and a fresh dispatch cache restoration are required.
The workspace default remains false in this prerequisite.
The ordered default flips follow their remaining gates.
