# ci packs into two jobs (opus-ts16c)

- Meta TEST-SPEED TS16c (J261): `ci` ran 5 jobs a push (check,
  author-tests ×2, products, e2e), each paying checkout, app token,
  candidate select and install. On 43262268467 the jobs queued for up
  to 3.5 min before a runner took them.
- Now `check` stays as it was and `products` also runs the author tests
  (unsharded) and e2e, on ubuntu-24.04 for Playwright. Later steps run
  even after an earlier red (`!cancelled()`), so one push still names
  every failing proof.
- A candidate run (dispatch) gives products 8 min, not 5.
- Target: wall at or under 5.5 min median, 5 green runs; the meta row
  records them.
