# A creature's phone mesh (ONE-FORMAT CC51a)

`bake/creaturePhone.ts` `creaturePhoneGlb` welds and simplifies a skinned creature GLB with meshoptimizer for the
phone: the rig, clips, named nodes and materials stay the source's, so the phone mesh passes the same skin admission and
poses from the same clips; it returns both triangle counts. A skin look cannot name a phone mesh yet: that slot is a
format change the engine must read (CC51b), and engine's format pin waits on MEMORY-GATES MG8.
