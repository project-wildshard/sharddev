## Authoring guide: from a graph to admitted rows

Run `pnpm gen` to rebuild this guide, the complete SDK/format API tables and
`docs/api/SHARDFILE.md` (every schema field and script ABI call). The examples
below are retained TypeScript sources: the documentation test typechecks and
executes them. They reduce Template 1's hall, door/wave and grey blob to the
smallest useful examples; additional mode/profile examples are explicitly
illustrative data, not changes to Template 1's shipped tuning.

Use real three.js `Scene`, `Group`, `Mesh`, `InstancedMesh`, geometry, materials,
lights and transforms. SDK objects add game declarations to that graph and emit
data. `generators/` and `data/` use the authoring SDK; a trusted `runtime/` may use
only the game's published `plugin/*` modules. Remaining SDK `runtime/*` exports
are compatibility APIs, not a route for a new data-only shard. No imports install
a service. A successful leaf parse does not prove that the complete product's
assets, references, collider clearance, budgets or gameplay have been admitted.

### Format contracts and JSON Schemas

`@wildshard/format/<module>` contains the defining Valibot schemas, types and pure
parsers. It depends only on Valibot. Parse rows before writing them; unknown
fields, invalid bounds and cross-field references refuse. The SDK's
`formatJsonSchema(schema)` produces Draft 2020-12 structural editor data from a
known defining schema. `formatJsonSchemas()` returns the migrated root documents;
`pnpm gen` writes them under `.wildshard/format/`. Named
`x-wildshard-checks` and UTF-16 string bounds still require the defining parser.
JSON Schema validation alone is not the admission verdict. The registry includes
player `modes`, authored `moverMotion` and executable `movers`, including their
component profiles and named mandatory semantic checks. Material-dependent
whole-shard declarations remain outside format until DS1.4.

<!-- example: format -->

### Scene graphs and scene.json

Build the hall with ordinary hierarchy operations. Give objects stable names;
place collision and player starts explicitly. A visible `Mesh` is not a collider.
`readScene(scene)` reads the graph in Node; `restoreSceneGraph(description)`
restores its ordinary three.js objects and SDK declaration classes after JSON
transport. Local recipes are retained separately from world-space compiler rows,
so parent transforms apply once. Entries (including Portal and SocketLift),
colliders, spawns, audio, movers and mode objects retain their defining classes.
Neither function
draws or installs gameplay. Instanced transforms, ordered skeleton joints and
inverse binds, named animation tracks and SDK game-concept sections are retained.
Unsupported shear/reflection, nonfinite values and unsupported texture/material
paths refuse. Capsules require uniform scale; entries and player starts keep
upright unscaled frames. Material/look authoring beyond this neutral floor waits
for DS1.4.

<!-- example: scene -->

### Synth CLI and build outputs

A local `shard.config.ts` exports `scene` (a real three.js graph) and
`identity = { slug: 'template-pilot' }`. From the repository, run
`pnpm exec wildshard synth <project-directory>`. It writes inspectable
`.wildshard/cache/template-pilot/scene.json` and an immutable SHA-256 copy beneath
that directory. `synthScene(scene, projectDirectory, slug)` is the equivalent
programmatic operation; the directory must exist. Then `wildshard build
<project-directory>` builds the declared shardfile project. Synth alone does not
produce an admitted `shard.json`, a card or an entry proof. Keep the readable
TypeScript generator; scene.json is a cache output, not committed source.

<!-- example: synth -->

### Bake readers: rigs, clips and images

Pass retained authored GLB bytes to `readRigRest` and `readRigMotion`. The former
returns mesh-local geometry, ordered model-space rest joints and the embedded
colour image; dispose its geometry when finished. The latter returns original
three.js `AnimationClip`s and named local node transforms, without a live mixer.
The rest reader admits one triangle skin/primitive; multi-skin composition must
be authored explicitly. Motion supports LINEAR/STEP, and refuses CUBICSPLINE,
morph animation and unsupported integer animation channels. No resampling is
implicit. `readImagePixels`/`writeImagePixels` operate on bounded RGBA images in
Node; the writer emits lossless PNG. The example consumes a real retained GLB,
not a made-up skeleton; supply a separate animation GLB as the second argument
when its clips live in another authored input. Author-tool image support is not shipped texture
admission: render textures still use the admitted KTX2 path. Shared figure-model
adoption remains an open graphical quality pass.

<!-- example: readers -->

### Directors: stages and the when-language

`Director` authors a version-2 ordered stage machine. Put `toJSON()` rows in the
root `directors` array (at most 16). Inputs bind existing `flag:`, `zone:`,
`event:` or `actor:<id>.dead|present` owners; the row does not create those owners.
The actual Template 1 door/wave uses quest-owned flags. Its initial stage is
unconditional. The next stage's `when` controls advancement; an explicit `next`
can be a stage id or an ordered array of `{ target, when }`, with the first true
guard selected. Explicit cycles retain their declared order. Stages/actions are
never sorted.

`director.attachTo(scene)` also retains the data-only Director in a named graph
node for scene.json transport. Restoration recreates it as
`node.userData.director`; the Director keeps its existing row `toJSON()` API.
This is an author declaration, not a runtime stage-host installation.

Conditions admit aliases, `true`, `false`, `!`, `&&`, `||` and parentheses with
normal boolean precedence. For example `doorOpen && !waveDead`; there are no
calls, comparisons or arbitrary JavaScript. Limits are 16 inputs, 64 stages,
32 actions per stage, 1024 condition characters, 128 tokens and 16 nested levels.
Missing aliases/targets and a conditional initial stage refuse before installation.

<!-- example: directors -->

The eight actions have these exact data forms. Each names an already-declared
owner or subscriber; admission of syntax grants no spawn/reward authority.

| Action | Data | Owner's responsibility |
|---|---|---|
| spawn | `{ spawn: 'template.wave' }` | Spawn the declared actor/group. |
| despawn | `{ despawn: 'template.wave' }` | Retire that declared actor/group. |
| flag | `{ flag: { key: 'template.wave-started', value: true } }` | Set a declared quest/state flag. |
| score | `{ score: 'template.score' }` | Select an admitted score. |
| weather | `{ weather: 'template.clear' }` | Select admitted weather data. |
| toast | `{ toast: 'template.tip' }` | Deliver a declared presentation event. |
| reward | `{ reward: 'template.reward' }` | Apply a declared gameplay reward. |
| emit | `{ emit: 'template.wave', value: 1 }` | Emit a bounded number/boolean (default 0). |

For AssemblyScript, `generateDirectorAbi(row)` generates `inputs`, `clock.tick`,
`clock.dt`, `clock.self`, `incomingEvents.count` and `incomingEvents.type(index)`.
Version-2 inputs are booleans; version-1 numeric inputs stay f64. Author source
imports `inputs` and `clock` from `./wildshard-director`; never hand-write memory
offsets. `behaviour/build.json` selects the row through its module's optional
`director` path; `wildshard build` supplies the generated module while compiling
the retained `behaviour/*.as` source. Module hashes come from the compiler's real
bytes. The existing AS handler and host decide how outputs select actions; a
stage row alone does not invent that handler. This small accessor proves the
boolean input module compiles; a playable handler still needs the declared host
exports/actions, not just an accessor.

<!-- example: director-script -->

### Movers: track, trigger, driver

`Mover` wraps a named real object. `toMotionData()` reads its `AnimationClip` into
rows; `toMoverData(rest)` adds the numeric local collision/rest declaration and
fixed driver hash/input. The example is a Template-style vertical door with a
separate pendulum, not a claim that every animated mesh has physics.

<!-- example: movers -->

A track animates its own body's position and/or quaternion with LINEAR keys,
including time 0 and the exact duration, at most 10 shared times. `loop` is
`once`, `repeat` or `pingpong`; `speed` multiplies playback. Triggers are `always`,
`interact` (permission 0 or 3), `stand` (delay) or `shared` (field/equals).
Drivers are `static`, `track`, `pendulum`, `winch` (`mode: 'ride'` or `'hinge'`) or `waves`.
A pendulum declares axis, amplitude in radians and period in seconds and has no
clip. Track requires a clip. The winch drivers accept their fixed two-stop layouts;
waves/static have no clip and use `always`. Invalid combinations refuse.
`compileMoverDriver('clip'|'ride'|'hinge'|'waves')` produces the actual admitted
fixed Wasm asset; publish those hash-addressed bytes in the product rather than
inventing a module hash. Local boxes/chains, aggregate body limits and the
row's executable ABI are validated together.

### Player modes: zipline, updraft, ride, grapple

All four are ordinary `Object3D` declarations. `Zipline` and `Updraft` have local
endpoint vectors, lowered through their world transforms. `Mount` emits ordered
walk/trot/canter/gallop speeds; `Grapple` emits bounded range and timing controls.
`toModeData()` yields rows for `modes.traverse`,
`modes.ride` and `modes.grapple`. `readScene(scene)` collects these objects into
its admitted `modes` section in traversal order, including parent-transformed
endpoints. No mode objects means no `modes` key. The example is a Template-sized
demonstration.

<!-- example: modes -->

Cable endpoints are floor positions; sag/hang are separate parameters. Updraft
is board-only and needs a horizontal run, width, lift and upper ceiling. Mount
profiles neither spawn nor tame a creature. Grapple profiles neither invent
anchors nor grant targets/floors. Native player/body/input owners must bind these
controls, and full admission proves their world/entry references.

### Weapon profiles and trusted weaponFamily

An optional weapon item's `profile` carries one `family` discriminator: `melee`,
`bow`, `firearm`, `thrown` or the additional `lash` contact profile. The item
family must explicitly accept that profile kind before allocation. A missing
profile retains the existing family rule. These four small examples are
illustrative numeric data for a Template-style equipment catalogue; they do not
change a shipped weapon.

<!-- example: weapons -->

Melee declares ordered swings, combo/heavy timing, lunges and sweep limits. Bow
declares draw/fatigue, spread and flight. Firearm declares magazine/reload,
semi/lever/bolt action, optional lever clocks and hitscan/flight projectile data.
Thrown declares windup/release/recovery, finite pool and walk-over pickup values.
Lash declares ordered unroll/second/show timing, pulls/stagger and named moves.
Views, audio, contacts, aim, ammunition and native continuations retain their
real owners. Profiles are not arbitrary new weapon algorithms.

Only a trusted `runtime/` imports
`@wildshard/engine/game/plugin/weaponFamily.registerWeaponFamily`. It registers an
existing weapon constructor in a caller-owned session registry, with a bounded
shard-local name; duplicate/reserved names and tool constructors refuse. Signal
and Sky use this for their native lash/fan. An author row naming a family does
not install a constructor. This typed runtime example deliberately takes the
real existing family instead of replacing its implementation.

<!-- example: weapon-family -->

### Brain archetypes, presets and boss rows

The five parametric decision families are stalker, guardian, grazer, diver and
boss. Existing names are presets with preserved save labels, not aliases that
change traces. Pattern-specific data must go with the real body's home, shared
RNG, navigation, strike, contact and flight ports. A parsed catalogue is not a
new actor or an attack permission. Template 1's actual pursuit/spawn example
below is the smaller generic creature path; the held boss is a minimal
illustrative declaration for its existing big-blob owner.

<!-- example: brains -->

| Archetype | Pattern / existing preset |
|---|---|
| stalker | `skirmish` / skirmisher; pack-group hunting |
| guardian | `interior` / guardian; `perch` / perch-hunter |
| grazer | `wander-ram` / ram-grazer; `circle-challenge` / challenge-grazer; herd-group grazing |
| diver | `orbit` / orbit-diver; `patrol` / patrol-diver; `burst` / burst-flyer |
| boss | `arena`, `roaming`, `spawned`, `held`, `script` |

Use the defining `brains`, `grazers`, `flyers`, `groupBrains` and `bossProfiles`
format parsers (or their SDK data constructors) before building a catalogue.
Named strikes must resolve. The boss row keeps the selected fight pattern's
phase thresholds, modes, attacks, rewards and continuation; the host must bind
that exact pattern. Script bosses wrap an admitted elite-script module, slots,
contacts and action order. A held boss keeps its actual body identity; a spawned
boss explicitly owns creation/checkpoint shares. Unsupported one-shard laws
remain trusted tails: Sky's phased-raptor is not silently a phased-flyer, and
Pine's animated hit timing/weather gaps are not closed by a schema parse.

### Commons packs: select immutable shared content

Commons is build-time content reused by at least two real shards; Template 1
does not count as the second user. A v1 pack supplies stable entry ids, original
encoded bytes and credit/licence. `createCatalogue` hashes bytes and derives
actual costs; `catalogueRef` resolves an entry to `commons:<hash>`.
`commonsRequirements` emits the selected unique `requires.commons`,
`commonsWire` and `commonsCosts`; add the reference to `library` and publish the
hash-addressed assets at the commons endpoint. Two products select the same hash,
so the shared cache downloads it once and leases it independently.

<!-- example: commons -->

There are no shared packs yet: a pack lands only in the commit where two real
shards use it (G355). The example's rows are a stand-in. Packs run in Node and
produce immutable partial content; models, clips and sounds stay backed by
retained authored inputs, and generated output never substitutes for its generator.

## Data-only herds and divers

The ordinary client and `HeadlessSimulation` install herd/grazer-herd and orbit/patrol-diver recipes for
a shard with no trusted runtime. Declare real species/variants, ordered group members and a sphere strike.
No `runtime/` installer or game import is needed. The recipe reads native world LOS and ground slope,
the player's measured speed, the host's shared `ai` RNG and attack authorization; the existing flight motor
and strike/contact pipeline move and damage. Per-host motion and policy clocks restore with the world.
There is no inferred cover, wind/scent, taming, pack interaction or audible cue binding; those need their
explicit owners. Trusted injected recipes retain precedence. Pack, burst and other specialized recipes still
refuse when no native owner is supplied. This example declares no rendered rig; creature view proof is separate.

<!-- example: creatures -->

## Install outside the workspace

Use the [standalone author setup](standalone-author.md) for matched SDK/format/commons release archives,
local CLI scripts, catalogue selection and the retained readable TypeScript world generator. Bootstrap
preserves installed dependencies and refuses existing authored files; no checkout link is an installation proof.

## Equip the author template's starter spear

The author template's `generators/spear.ts` is the Mesa fixture's own spear: no real shard uses it, so it is
not a `@wildshard/commons` pack (G355). Its `starterSpearPack` retains a readable TypeScript model generator
and a versioned contact/loadout recipe, published through a project-local catalogue.
Select both `starter-spear/model` and `starter-spear/contacts`; publish their hash-addressed bytes and add
both references to `library`. `spearLoadout` checks the catalogue identity and exact closure before returning
detached item rows. The normal client equips the GLB through `kit.melee`; attacks use the existing fixed-step
contact pipeline and its cooldowns. This starter thrusts and performs a charged heavy thrust. It does not
throw javelins or claim Nalati's mounted lance, painterly view, or arm animation. No game import is needed.

The static model has no textures, rig or clips: its complete asset closure is the model and contact recipe.
Materials come from the model; `view.colour` does not repaint it. The last owner releases shared resources,
and every owner has independent held transforms. Two products reuse each hash through the normal cache.

<!-- example: spear -->

## Export named model parts (OS-G6)

`staticGlb` emits one glTF node per primitive. Its optional per-primitive `name`
is the stable name for interactions and presentation bindings; the overall name
is only the fallback. Explicit names must be unique and loader-safe (letters,
digits, underscore or hyphen; at most 128 characters). Duplicate or sanitized
names refuse export. Unnamed existing exports retain their exact bytes.

<!-- example: named-nodes -->

The named-node example also emits an exact rest hierarchy with
`clientSceneGlb`: the existing V1 scene rows and mesh-local GLB accessors are
separate outputs. Materials are named client ports, not copies of shader
code. A declared model-library geometry pool preserves original Float32
channels, index width, groups and bounds; `geometry(id)` lends independent
owned copies to `createClientScene`. Unsupported geometry refuses rather
than converting or refitting it.
