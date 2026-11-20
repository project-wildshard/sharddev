# Hull looks bake phone skins

> Written by: Claude

ONE-FORMAT OF23f. `hullCreature` takes `look.phone`: a lighter rig, phone maps
and each variant's phone coat. It bakes every variant again on those, keeps the
desktop flap, fur and parts (the phone skin must keep its variant's contract),
and names the result as the look's `phone` and `phoneVariants`. A coated
variant with no phone coat refuses rather than shipping desktop art to phones.
The scene shard file gives each variant table exactly the skins it names.

Needs shard-format with phone variant tables (the release after 0.60.0).
