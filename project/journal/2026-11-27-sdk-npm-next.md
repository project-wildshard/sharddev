The v0.9.0 publisher refused its prerelease engine pin before uploading
any workspace package. Route exact engine next pins to npm next and
keep the packed-engine dependency guard on latest. The manual next
job recovers an immutable release tag after exact release CI passes.
