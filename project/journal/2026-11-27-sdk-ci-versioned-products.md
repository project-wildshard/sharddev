The installed map, navigation, and Ring 2 author proofs now keep
their build folders inside the project created by wildshard new.
The pack command finds that author's package.json and checks it
against the authored shardVersion in the built header.

The input-edit proof keeps the built level's look when it creates
an editable manifest from packed discovery. Those values live in
the look section on the wire.
