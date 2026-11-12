# Mossgate: spent brazier prompts (opus-mgprompt)

- Braziers A, B and C name their lit condition in `unless` (TE-ENG6's
  rule), and `product.ts` passes it through to `targets.interactions`.
  Once lit, "Light brazier X" and the touch USE band go; the hut door
  (a toggle) keeps its prompt. Pins move to engine 3e4352be and format
  563d680, engine main's own, for repo-kit's local-sdk-pin test.
- Proof: a headless 402x874 phone page on an engine preview of the built
  `out/_template` shows the band at A and B, a tap lights each, and
  standing in the same spot the band is gone. Board
  `template-e2e-v3/progress/t1-12-prompts.jpg`.
