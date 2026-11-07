import { phasedBossFight as platformFight, type PhasedBossBody as PlatformBody, type PhasedBossFight as PlatformFight, type PhasedBossPorts as PlatformPorts,
  type PhasedBossRow as PlatformRow, type BossViewBinding as PlatformViews, type BossViewCall as PlatformViewCall, type PhasedBossState as PlatformState,
  type RoamingBossBody as MobileBody, type RoamingBossRow as MobileRow, type RoamingBossPorts as MobilePorts, type RoamingBossFight as MobileFight } from '@wildshard/engine/game/plugin/bossPhase';

/** A phased boss fight's row (SHARD-PLATFORM SF27): modes, phases, attack rows, adds, hazards and the declared view names. */
export type PhasedBossRow = PlatformRow;
/** The body a phased boss fight drives (the engine's animal, structurally). */
export type PhasedBossBody = PlatformBody;
/** What a phased boss fight is lent: arena, bodies, player, hit resolvers, rng, feed and the view bindings. */
export type PhasedBossPorts<A extends PlatformBody> = PlatformPorts<A>;
/** A phased boss fight: its `BossScript`, the body's brain, its bodies and its continuation. */
export type PhasedBossFight<A extends PlatformBody> = PlatformFight<A>;
/** A phased boss fight's continuation (its modes, clocks, hazards). */
export type PhasedBossState = PlatformState;
/** The shard's bindings for a fight's declared views: name → function of numbers. */
export type BossViewBinding = PlatformViews;
/** A declared view call as data: `[name, ...numbers]`. */
export type BossViewCall = PlatformViewCall;
/**
 * A phased boss fight from its row (SF27): a declared state machine of modes with timed beats, strike rows, invulnerability
 * windows, adds and arena hazards, view-free; the shard binds the named views and lends its arena.
 */
export function phasedBossFight<B extends MobileBody,L,R,K extends string,A extends string,Q extends string>(row: MobileRow<K,A,Q>,ports: MobilePorts<B,L,R,K,A,Q>): MobileFight<B,L,R>;
/** Run the fixed-arena phase, combo and hazard policy. */
export function phasedBossFight<B extends PlatformBody>(row: PlatformRow, ports: PlatformPorts<B>): PlatformFight<B>;
export function phasedBossFight<B extends PlatformBody,C extends MobileBody,L,R,K extends string,A extends string,Q extends string>(row: PlatformRow|MobileRow<K,A,Q>,ports: PlatformPorts<B>|MobilePorts<C,L,R,K,A,Q>): PlatformFight<B>|MobileFight<C,L,R> {
  if('kind' in row && 'random' in ports)return platformFight(row,ports);
  if('kind' in row || 'random' in ports)throw new Error('Phased boss row/host policy mismatch');
  return platformFight(row,ports);
}
/** A roaming phased encounter: stance modes, strike clocks, lane chains, falling hazards and mobile adds as data. */
export type RoamingBossRow<K extends string,A extends string,Q extends string> = MobileRow<K,A,Q>;
/** Exact roaming policy continuation and BossScript on the host's actual bodies and lane schema. */
export type RoamingBossFight<B extends MobileBody,L,R> = MobileFight<B,L,R>;
