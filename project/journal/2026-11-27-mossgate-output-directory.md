# Mossgate's prepared pack creates its output directory

A clean release checkout has no tmp/publish directory. Browser
preparation succeeded, then the shardfile writer failed opening its
partial output. Create the destination before calling the same pack
command. The retry wrote and validated the shardfile, and the normal
upload reached staging as Mossgate 0.1.22.
