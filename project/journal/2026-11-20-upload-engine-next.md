# Upload preserves the exact npm next engine pin

FS28 and J475 publish a staging build as `X.Y.Z-next.<sha>`.
The upload CLI reads the installed engine package version, keeps the
whole prerelease on the wire and still accepts stable engine versions.
Shard versions and format versions use their existing stable schema.

The regression reads Pine's `0.1.54-next.6bab8fcc` pin from an
installed manifest and checks the value the upload sends to staging.
Malformed prereleases still fail before bytes move.
