# Creature caps in `wildshard check` (ONE-FORMAT CC47)

Phone perf is the reason (Q-CC14, Q-CC15): CC53 measured 30 skinned deer and found the cost is per draw and per
bone. `check` now refuses a creature over 64 bones or 16 hit volumes, each with its own rule, and warns past its size
class's triangle and decoded-bytes marks (medium is the 3k-triangle phone deer, the kit's PBR bear passes). The report
card prints each creature's bones, volumes and triangles beside the budget tier. The caps live in the SDK, beside the
format's own 32-socket and 16-volume parse limits; the format's GLB joint cap stays 128 until a format row lowers it.
