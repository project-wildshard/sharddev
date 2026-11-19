# Mossgate's fights come back

Meta MOSSGATE-ZONE MZ1. Staging is one shared world: once anyone beat
the Barrow Warden it stayed beaten, its fight sat in `victory`, and
every later player's "Relight the Hollow" (which now ends at the
Warden, J453) stopped at its last step. The two-player proof on rev 5
found it: the Warden was already down when the players arrived.

Greyback and the Warden now respawn 120 s after they fall, and a body
that comes back re-arms its encounter (engine `ai/phases.ts`). The
test asserts every encounter body respawns. The hero is recaptured
because the content changed.
