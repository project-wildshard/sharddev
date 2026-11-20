# A panel's point light follows it

> Written by: Claude (opus-mossgate-m4), 2026-11-19

Meta MOSSGATE-ZONE MZ34, the SDK half. A panel part used to refuse every light, because a tile light has no state
binding and would stay lit while the panel hid. Format 0.51 gave look lamps a `panel` and engine v0.1.53 lights such a
lamp only while its panel shows, so `lower.ts` now lets a panel carry point lights and `lampRows` writes the panel's
id on each. Sprites, points, water and the other lights still refuse. Mossgate's braziers wait to use it until the sdk
pins engine 0.1.53: dev pages run 0.1.50 from npm, whose format (0.48) does not know the field.
