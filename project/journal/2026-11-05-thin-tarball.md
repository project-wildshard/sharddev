# A tarball without its packs

Claude, 2026-11-05. Pine with its art is 464 MB, 109 MB of it `blobs/pack/`,
and every pack member also ships at its own path. So `pack` leaves them out and
format (v0.3.8) rebuilds and hash-checks each one. Real Pine: 372 MB, 335 MB at
Brotli 6, committed on a default function in 90 s with the upload. api-server's
cap is 450 MB now that a commit streams (its D34).
