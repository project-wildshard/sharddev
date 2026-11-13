// SHARD-AUTHORING SA12: the SDK defines its own author types, and this file (tsc-checked by tsconfig.author.json) keeps
// each one equal to the engine type it stands for. When engine changes one of these types, `pnpm typecheck:author`
// fails here, naming the SDK type to update.
import type * as Animation from '@wildshard/engine/game/plugin/animation';
import type * as Baked from '@wildshard/engine/game/plugin/bakedGeometry';
import type * as Boss from '@wildshard/engine/game/plugin/bossPhase';
import type * as Brain from '@wildshard/engine/game/plugin/brain';
import type * as Bow from '@wildshard/engine/combat/view/bowProfile';
import type * as Melee from '@wildshard/engine/combat/meleeProfile';
import type * as Clips from '@wildshard/sdk/species/clips';
import type * as Kit from '@wildshard/sdk/kit/bakedGeometry';
import type * as PhasedBoss from '@wildshard/sdk/phasedBoss';
import type * as SpeciesBrains from '@wildshard/sdk/speciesBrains';
import type * as BowProfile from '@wildshard/sdk/weapons/bowProfile';
import type * as MeleeProfile from '@wildshard/sdk/weapons/meleeProfile';
import { expectTypeOf, test } from 'vitest';

test('the SDK clip row types equal the engine animation types', () => {
  expectTypeOf<Clips.ClipClock>().toEqualTypeOf<Animation.ClipClock>();
  expectTypeOf<Clips.ClipWhen>().toEqualTypeOf<Animation.ClipWhen>();
  expectTypeOf<Clips.ClipFactor>().toEqualTypeOf<Animation.ClipFactor>();
  expectTypeOf<Clips.ClipTerm>().toEqualTypeOf<Animation.ClipTerm>();
  expectTypeOf<Clips.ClipCase>().toEqualTypeOf<Animation.ClipCase>();
  expectTypeOf<Clips.ClipChannel>().toEqualTypeOf<Animation.ClipChannel>();
  expectTypeOf<Clips.ClipRow>().toEqualTypeOf<Animation.ClipRow>();
  expectTypeOf<Clips.SpeciesClips>().toEqualTypeOf<Animation.SpeciesClips>();
});

test('the SDK bake codec types equal the engine codec types', () => {
  expectTypeOf<Kit.BakedType>().toEqualTypeOf<Baked.BakedType>();
  expectTypeOf<Kit.BakedGeometryRow>().toEqualTypeOf<Baked.BakedGeometryRow>();
  expectTypeOf<typeof Kit.BAKED_BYTES>().toEqualTypeOf<typeof Baked.BAKED_BYTES>();
});

test('the SDK boss rows equal the engine boss rows', () => {
  expectTypeOf<PhasedBoss.BossViewCall>().toEqualTypeOf<Boss.BossViewCall>();
  expectTypeOf<PhasedBoss.BossViewBinding>().toEqualTypeOf<Boss.BossViewBinding>();
  expectTypeOf<PhasedBoss.BossEffect>().toEqualTypeOf<Boss.BossEffect>();
  expectTypeOf<PhasedBoss.BossModeRow>().toEqualTypeOf<Boss.BossModeRow>();
  expectTypeOf<PhasedBoss.BossAttackRows>().toEqualTypeOf<Boss.BossAttackRows>();
  expectTypeOf<PhasedBoss.BossPhaseRow>().toEqualTypeOf<Boss.BossPhaseRow>();
  expectTypeOf<PhasedBoss.PhasedBossRow>().toEqualTypeOf<Boss.PhasedBossRow>();
  expectTypeOf<PhasedBoss.RoamingBossPhase>().toEqualTypeOf<Boss.RoamingBossPhase>();
  expectTypeOf<PhasedBoss.RoamingBossMode>().toEqualTypeOf<Boss.RoamingBossMode>();
  expectTypeOf<PhasedBoss.RoamingBossRow<'add', 'swing', 'roar'>>().toEqualTypeOf<Boss.RoamingBossRow<'add', 'swing', 'roar'>>();
  expectTypeOf<PhasedBoss.RoamingBossRow<string, string, string>>().toEqualTypeOf<Boss.RoamingBossRow<string, string, string>>();
});

test('the SDK species row and brain equal the engine brain types', () => {
  expectTypeOf<SpeciesBrains.SpeciesBrain>().toEqualTypeOf<Brain.SpeciesBrain>();
  // The engine's row is an intersection (`Omit<SpeciesRow, …> & { brain, body }`): `branded` compares it deeply.
  expectTypeOf<SpeciesBrains.BrainedSpecies>().branded.toEqualTypeOf<Brain.BrainedSpecies>();
});

test('the SDK weapon types equal the engine weapon types', () => {
  expectTypeOf<BowProfile.BowStyle>().toEqualTypeOf<Bow.BowStyle>();
  expectTypeOf<MeleeProfile.ViewmodelFeel>().toEqualTypeOf<Melee.ViewmodelFeel>();
  // The engine row also carries the host's `pickup` factory (runtime, not author data): every other field is the SDK's.
  expectTypeOf<MeleeProfile.MeleeProfile>().branded.toEqualTypeOf<Omit<Melee.MeleeProfile, 'pickup'>>();
  // And a profile passes either way: an author's row to the engine, the engine's starter row back to an author. These two
  // assignments are the check; tsc refuses this file when either way breaks.
  const toEngine = (row: MeleeProfile.MeleeProfile): Melee.MeleeProfile => row;
  const toAuthor = (row: Melee.MeleeProfile): MeleeProfile.MeleeProfile => row;
  void [toEngine, toAuthor];
});
