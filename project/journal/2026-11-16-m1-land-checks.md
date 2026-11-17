# Close the M1 source land checks

The full local SDK checks found a stale extraction test after the six kit
module moves, missing export-tier metadata for the creature-copy helper,
and a codemod inventory test that treated a declaration file as executable.
The extraction test now checks the public kit import against shipped JSON,
and the codemod inventory checks paired declarations separately.

The kit and SDK have independent versions. Migration pins the installed kit
version instead of the SDK version. Later update operations move that direct
kit pin with the SDK release's declared dependency. The migration remains
idempotent and preserves generated files and foreign symlink targets.
