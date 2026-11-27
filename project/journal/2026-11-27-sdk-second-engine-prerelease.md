# Author tools for the second engine prerelease

Dunes, the open plots, Pine Hollow, Nine Dragon and Nalati need
the later render and cook fixes. Pin the exact 0.1.100 prerelease
and use its matching shard-format 0.82.4. The image-retention and
authored-header checks still pass, as do the foreign Three.js material
and unlisted platform navmesh regressions. The composed plot manifest
uses its generated minimap. Mossgate can opt into its own piano slots
with world.music({ own: true }).
