# Creature presets

> Written by: Codex
> State: M1 content/helpers built, 2026-11-15; package release pending.

The plain JSON catalogue and TypeScript helpers describe the same rows.
Copy the content you use into a shard at build time. A kit update changes
a shard only when that shard rebuilds with the updated content.

`@wildshard/kit/legacySpecies` supplies fresh compatibility profiles for old
source labels. The SDK expands those profiles into explicit rows at build time
and warns. A shard's existing spawn brain and an encounter-owned body keep
their declarations. New species declare their own temperament; an unknown label
does not select an implicit profile. A body using its own GLB may omit the kit
skeleton name; kit posers name their skeleton contract explicitly.

`bakeSpecies` also copies the kit's exact hunting numbers when old native source
uses one of its known hunting labels without tuning. It warns and leaves an
existing tuning declaration unchanged. Another label receives no implicit
profile. The emitted declaration therefore carries its numbers into the product
before the engine's old preset selection is removed.

A complete old species-program section with an explicit hunt owner also copies
the prior numbers for its existing aggressive flag into native, page and policy
rows. Each custom policy keeps its own parameters. A section without that hunt
owner receives no hunting numbers. The SDK rehashes changed section bytes before
admission; no content is selected in the engine.

`commonCreature('boar' | 'bear', { id, look, strike? })` copies the complete
layered species and its strike rows. Its body uses the caller's look; its ordered
variants retain their authored dimensions, health and modifiers. Hunting includes
explicit walk, charge, windup, ring and trample numbers in `tuning.motion`, beside
the existing hunt numbers. The consumer reads those parameters at setup. Sounds,
perception and ability values come from the shipped JSON. Calls own their nested
rows; editing one result changes no other caller. Asset assembly and loot rows
are separate producer integration steps.

The temperament helper returns temperament and senses together:

```ts
import { abilities, quadruped, temperament } from '@wildshard/kit';

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

The package root exports these helpers and their option/result types. The
body, temperament and abilities subpaths expose them separately. Plain JSON
is available under the content subpath, including content/temperaments.json,
content/tuning/*.json and content/abilities/*.json.

commonSpeciesRows reads fresh complete boar/bear gameplay metadata with an
authored species id. The species subpath and content/species/*.json expose
these same values for existing bake callers. These compatibility definitions
preserve current bytes; OF3 supplies the layered species and GLB body assets.

## Body builders

`@wildshard/kit/bake/species` exports `bakeCommonBody`,
`commonBodyVariants`, `BOAR_LOOK`, `BEAR_LOOK` and `withBodyGeometry`.
The builders use the SDK random/noise exports and Three geometry types;
the kit contains no engine import. The SDK is a peer during its package
split. Runtime pages read the built content copied into the shard file.

```ts
import { Rng } from '@wildshard/sdk/random'
import { bakeCommonBody, commonBodyVariants, withBodyGeometry } from '@wildshard/kit/bake/species'

const variant = commonBodyVariants('boar')[0]
if (variant === undefined) throw new Error('No boar variant')
const baked = withBodyGeometry(false, {}, () =>
  bakeCommonBody('boar', variant, new Rng(42).snapshot()))
// The caller owns baked.body's geometries and baked.random.
```

`withBodyGeometry(lowPoly, paints, build)` restores any outer style, paint,
shape and shag context on return or failure. The PBR and low-poly builders
preserve every original typed channel, bone, dimension and random draw
across all eleven variants. SDK's loft helpers now live in
`@wildshard/kit/bake/species`, alongside their structural body types. The package exports each defining module.

## Plain body files

`content/creatures/bodies.json` lists the body GLB for every boar/bear
variant in both styles, its SHA-256, byte count, joint rest positions and
dimensions. Each creature's `look.json` preserves its authored look knobs.
JSON and Python authors may copy these ordinary files without running a
TypeScript builder. `geometry/export` exports the deterministic builder.

Regenerate with `node scripts/build-kit-bodies.mjs`, or verify every byte
with `node scripts/build-kit-bodies.mjs --check` from the SDK checkout.
The GLBs preserve position, normal, UV, colour, skin indices, weights and
fur-length channels. Three body parts keep their geometry separate.
These body files contain no animation clips.

## Animated body files

`content/animated/catalogue.json` lists every variant's animated GLB and
skin binding in both styles, with hashes, sizes, rest bones and dimensions.
`geometry/export` provides `exportAnimatedCommonBody`. The same body channels
are merged into one admitted skin mesh; the original body files stay exact.

`content/clips/quadruped.json` holds the existing six quadruped clips and
periodic pose tables. `clips` provides `quadrupedClips(bones)`, which maps
named chains and translates source rest offsets, and `quadrupedBinding(id)`,
which returns fresh binding data. Missing chains refuse before export.
Scene-root motion remains actor-owned, as in the existing skin driver.

From the SDK checkout, `node scripts/extract-kit-clips.mjs --check` verifies
the immutable original content. `node scripts/build-kit-creatures.mjs --check`
compares every animated asset and admits its clip/binding contracts. Omit
`--check` to regenerate. Variant selection and the layered fixture are
OF3b2/OF3b3; the visual comparison is OF3c.

## Shared builders and tables

`arms` builds the original glove, sleeve and forearm geometry without a
live owner. `weapons/starterMeleeProfile` and `weapons/starterMoves` hold
the original starter sword policy and rich Three poses, using the kit's
structural types. `sharedSpecs` contains default tree traits and the
puzzle barrel's complete physical declaration. Bow and pickup tables are
plain JSON in `content/shared`.

The SDK's corresponding helpers now consume these kit modules. Portable
math belongs to the SDK library at `@wildshard/sdk/math/portableMath`.
The practice course is parked and remains outside this kit release.

## Module migration

The six defining modules now belong to kit: `bake/species`,
`bake/riderArms`, `bake/specimenCatalogue`, `bake/nativeInteractionFacts`,
`weapons/meleeProfile` and `weapons/bowProfile`. SDK no longer exports
these paths. Their original numeric, pose and data values are preserved.

`MeleeProfile<Icon, Slot, Touch>` lets a host specialize its UI vocabulary
at its adapter without importing that host into kit. The default names
are author strings; the starter sword keeps its concrete names. Host
specialization retains the complete prior weapon type contract.

The SDK's `@wildshard/sdk/kit/creatures` module exports `kitCreature(kind,
{ id, look, family, strike?, skins? })`. It returns the layered species, strikes,
look, file declarations, library roots and exact asset bytes to add to a shard.
Choose `pbr` or `toon` explicitly. A `skins` entry maps an existing species variant
id to a shipped body variant; aliases share their skin JSON and GLB. Unknown ids
or bodies refuse. The table covers every gameplay variant, and every distinct
skin passes ordinary binary admission before this helper returns.
