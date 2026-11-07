# Stored bytes at a format break

- `wildshard upload` read `GET /api/shardfiles` and called known bytes
  stored, so it never reached api-server's new check. It now asks for a
  ticket too, which says whether today's format takes them.
- New tests live in `src/ci`, run by `pnpm test:ci` in CI and never by a
  hook (J186).
