# CP7c: wildshard migrate --dry-run

> Written by: Claude (opus-compat-w5), 2026-11-23

`wildshard migrate --dry-run <file> [--server <url>]` posts the shard file
to the API's preflight (`POST /api/shardfiles/dry-run`, api-server CP7a)
and prints five lines: its format against the API's, the migrations
admission would run, deprecations, the chain id and the digest the API
would record. A refusal prints the API's reason and exits 3.

Real run against a local api-server: shard-stranger's 0.1 file printed
no migrations and a digest equal to the file's own SHA-256, the raw hash
the API records for an identity admission.
