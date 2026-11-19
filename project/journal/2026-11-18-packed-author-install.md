# Test the six release tarballs as an author

The installed-author tests still cover engine and product integration.
This job packs the release graph, installs the six archives in a fresh
folder with an empty home, and runs the installed bin. The generated
project installs from the same archives. The starter chest tape proves
the shard, the built and packed files match, and dev serves the shard
through a fixture client shell.
