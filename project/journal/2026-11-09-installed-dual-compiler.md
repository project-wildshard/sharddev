# Let installed owners run their preserved AS port proofs

The retained script-v2-ports row belongs at installed compiler and
content boundaries. The existing dual compiler lives in this SDK, but
its missing package export prevented owners from using it without a
private source import. The public import reproduced
ERR_PACKAGE_PATH_NOT_EXPORTED before this change.

Expose that existing test-only function at an explicit test subpath.
Its implementation, source-closure reachability checks, both public
admission contracts and output bytes are unchanged. No runtime facade,
wire schema or shipped shadow artifact is introduced. Owners can now
carry the real authored fixtures beside their source instead of reading
the deleted pre-split shard tree. The SDK waiting row stays open until
all remaining owner executions and exact CI are green.

The installed public helper now compiles and executes Driftwood's actual
return closure from a real packed SDK, in 0.72 seconds. The tarball
contains the exported module (1,272 entries, 3,896 KiB). Owner-side
continuations execute four non-director Driftwood ports in 2.21 seconds
and twelve Pine ports in 4.63 seconds, each keeping a 9.5-second cap.
Preserved bodies are read from the real owner files, with compiler
reachability and independent source enrollment checks. No original
outcome assertion was dropped; Vitest assertions became strict Node
assertions and the bridge uses the actual clock. Original directors
retain their earlier shipping-hash/real-consumer owner proofs.
