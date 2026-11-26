# Validate authored versions before upload

RL2 checks the handwritten product index against the source package before
packing. The upload CLI compares those versions with its upload argument
before it contacts the API. The check reports every value it saw.
