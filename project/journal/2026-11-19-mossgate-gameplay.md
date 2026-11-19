# 2026-11-19: Mossgate Hollow gets the Template's gameplay (TR-12)

Meta TEMPLATE-E2E TR-12 (J434). Jake: the legacy Template goes, and Mossgate
and Brasscap are the templates. The catch: Mossgate's gameplay (TC-M's
braziers, lever, lift, chest, rack and talks) lived only in `_template`, and
Mossgate itself was scene only (`world.ts`: "making it live is stage 6"). This
moves it onto Mossgate's scene before TR-11 deletes `_template`.

- No hand-written script: every switch is scene state (SS-GF0). A prompt
  `sets` a shared field; a panel part's `shownWhen` reads it; the sdk writes the
  fields, hooks, panels and the one server module. `play.ts` holds it: the
  three braziers and their flames, the moss gate's bars (brazier A sinks them),
  the pond's stones (brazier B raises them), the lever and the north gate it
  opens (a new gap in the yard's north wall), the chest's lid, the rack, the
  hut lantern on its stand (`world.pickup`), and the lift (a mover) and the
  ledge whose region pays.
- `extend` adds the rest (`gameplay.ts`, as TR-2's `quests.ts` began): seven
  quests (the hut, the first flame, Relight the Hollow, the Hermit's gate, the
  chest, the ledge, the rack), the Lamplighter's and the Pond Hermit's talks,
  the moss blade the rack hands over (not in the loadout, so it starts on its
  rack), and five achievements. A lit brazier raises its flag through a
  `script` trigger on the `<prompt>.spent` condition the sdk writes.
- The Lamplighter's figure is a panel her talk names, so the page draws her
  once (no stand-in beside her); her belt and staff wear plain materials, since
  a panel may not share the far tiles' textures.
- Every brazier now starts cold, so the cleanroom's lit brazier A and its light
  are gone from the static scene: the flames are panels, and a panel's light
  would burn whatever its field said.
- The starter's tape walks on from the hut door to brazier A and lights it:
  `hut.visit` at tick 160, `mossgate.first-light` at tick 382.

Proved on a fresh starter (`wildshard new`, this checkout's packages): check
passes (prove: 482 ticks, 2 facts); a headless page talks to both NPCs, lights
the three braziers, takes the moss blade into the hotbar, pulls the lever and
opens the chest, and both quest chains complete with no page error.

Left as TR-12b: the creatures (4 species, 12 bodies, the mossling pack,
Greyback) and the Barrow Warden's fight (its decision script) need skins in
the shard store, which `extend` cannot add. `wildshard content --bar templates`
is short on those lines and on POIs (it counts only a legacy level manifest's).
