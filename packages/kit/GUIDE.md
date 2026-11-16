# Creature presets

> Written by: Codex
> State: M1 content/helpers built, 2026-11-15; package release pending.

The plain JSON catalogue and TypeScript helpers describe the same rows.
Copy the content you use into a shard at build time. A kit update changes
a shard only when that shard rebuilds with the updated content.

The temperament helper returns temperament and senses together:

```ts
const profile = temperament.pack({ aggro: 18, assist: 14 });
const body = quadruped({ size: 'medium', scale: 1, look: 'mesa.wolf.look' });
const bite = abilities.bite({ id: 'mesa.wolf.bite', damage: 12 });
// Spread profile onto the species, add body, place bite.ability in its
// priority list and bite.strike in the shard's strike rows.
```

Reaction/modifier presets: passive, skittish, neutral, aggressive, pack,
territorial, ambush, flee and pursue. Aggro overrides the notice radius;
leash, assist, homeSpeed and homeStop override their corresponding numbers.
Each call returns a fresh row and validates its numeric overrides.

The complete boar, bear and deer tuning documents preserve existing values.
Pursuit keeps the Template's current pursuit numbers. Modifier profiles reuse
these tuning documents; they add their stated reaction or modifier. Their
runtime interpretation belongs to the later resolver and brain rows.

Body helpers are quadruped and biped. A look id is required. Defaults are
medium size and scale 1; these defaults do not create a mesh or a look row.

Ability helpers are bite, claw, swing, charge and slam. Each returns its
strike row and the matching ability reference. Options can override id,
damage, range, cooldown, weight and the ability's hpBelow gate. An id override
changes both the strike id and its use reference. Rows keep their catalogue
order and omit optional fields until authored.

Defaults preserve existing strike numbers: bite from the Template's bump,
claw from Brasscap's dive, swing from its sweep, charge from the Template
boar and slam from its Warden. These are reusable templates, so a caller
chooses range and damage for its own body. In particular the sweep's current
7 m radius is a large attack; an ordinary sword swing should state its range.
Identity and tags use the kit names; the underlying numeric values stay the
same. Later ability rows add origin sockets, clips, tells and effects.
