# A hull map a species skin needs is not late (opus-pine3, OF23a)

- Pine's species skins (OF23a) reuse the hull book's desktop maps and
  coats byte for byte. `riggedHullLate` scheduled every hull-book file
  late, so the skin's texture was not there at level.world and the
  world failed on phone and desktop ("Missing admitted material
  texture").
- Now a hull-book file that any output or declared file depends on is
  held back from late, like a critical one. `lateHullFiles` is the rule,
  tested on its own.
