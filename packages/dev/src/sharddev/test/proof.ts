// oxlint-disable-next-line import/no-unassigned-import -- The sim's Math goes in before any module body runs.
import '@wildshard/engine/core/portableMathFirst';
// oxlint-disable-next-line import/no-nodejs-modules -- A proof reads its built folder and the pinned physics bytes from disk.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The physics package resolves from dev's own engine pin.
import { createRequire } from 'node:module';
import { loadRapier, type Rapier } from '@wildshard/engine/physics/rapier';
import { admittedFolder, type FolderMode } from '@wildshard/engine/test/headless/admittedFolderCache';
import { createNativeProofResident, prepareFolderPlan } from '@wildshard/engine/test/headless-native';
import { folderHeadlessSections } from '@wildshard/engine/host/headlessSections';
import { outputDescriptor } from '@wildshard/engine/game/shardfile/outputDescriptor';
import { leadPlayer } from '@wildshard/engine/sim/leadPlayer';
import { serializeSimSnapshot, snapshotSimHostBytes } from '@wildshard/engine/sim/snapshot';
import { canonicalSimDigest } from '@wildshard/engine/test/simState';
import type { HeadlessRuntimeInput, NativeHeadlessResident, PrepareHeadlessRuntime } from '@wildshard/engine/host/headlessRuntime';
import type { HeadlessCommand } from '@wildshard/engine/host/tickProtocol';
import type { ShardFolder } from '@wildshard/engine/game/shardfile/shardFolder';
import type { SimHost } from '@wildshard/engine/sim';
import { loadHeadlessFolder } from '@wildshard/engine/host/headlessFolder';
import { serverInputFiles } from '@wildshard/engine/game/shardfile/serverSkinRigs';
import { createShardfileSim, type ShardfileSimulation } from '@wildshard/engine/game/plugin/simulation';
import { createQuestLedger } from '@wildshard/engine/game/quest/ledger';
import { SaveStore } from '@wildshard/engine/saves/store';
import { actRoutes } from '@wildshard/engine/sim/actRoutes';
import { questBooks } from '@wildshard/engine/quest/players';
import type { QuestDataPorts } from '@wildshard/engine/game/quest/declared';

/**
 * SHARD-COMPAT CP18b (meta): the shard proof harness. A shard repo's proofs and tests boot a built folder here, from
 * `@wildshard/dev`'s own exact engine pin, instead of importing engine subpaths, so the shard lists no
 * `@wildshard/engine` and an engine release needs no shard commit. It is the boot every shard copied into its own
 * `test/fixtures` (native-rapier-file, productSession, the createNativeProofResident call), in one place.
 */
export interface ShardProof {
  readonly product: ShardFolder;
  readonly assets: ReadonlyMap<string, Uint8Array>;
  readonly rapier: Rapier;
  readonly resident: NativeHeadlessResident;
  readonly host: SimHost;
  /** The lead player, the one `step` commands drive. */
  readonly lead: () => ReturnType<typeof leadPlayer>;
  /** One tick of lead-player commands. */
  readonly step: (commands?: readonly HeadlessCommand[]) => void;
  /** The world now, as the save wire carries it; pass it back as `snapshot` to resume. */
  readonly snapshot: () => string;
  /** A short stable digest of the world now, for parity and replay checks. */
  readonly digest: () => string;
  readonly descriptor: NonNullable<ReturnType<typeof outputDescriptor>>;
  readonly dispose: () => void;
}
export interface ShardProofOptions {
  /** Which admission the folder gets; proofs boot `'full'`. */
  readonly mode?: FolderMode;
  /** The shard's own runtime preparation, else the folder's native plan. */
  readonly prepare?: PrepareHeadlessRuntime;
  /** A `snapshot()` string to resume from. */
  readonly snapshot?: string;
}
/** What `openShardProof` composes; tests replace these, shards never do. */
export interface ShardProofPorts {
  readonly admit: typeof admittedFolder;
  readonly rapier: () => Promise<Rapier>;
  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- engine's runtime input type, passed through as is.
  readonly resident: (input: HeadlessRuntimeInput, prepare: PrepareHeadlessRuntime, snapshot?: string) => Promise<NativeHeadlessResident>;
}

/** The pinned physics wasm, from dev's engine: the file a shard's proof used to resolve itself. */
const fromDev = createRequire(import.meta.url);
export const nativeRapierFile: string = createRequire(fromDev.resolve('@wildshard/engine/package.json')).resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm');

const defaultPorts: ShardProofPorts = {
  admit: admittedFolder,
  rapier: async (): Promise<Rapier> => await loadRapier(readFileSync(nativeRapierFile)),
  resident: createNativeProofResident,
};

/** Boot a built folder (`out/<slug>`) as the MMO server's simulation would, for one proof. */
export async function openShardProof(directory: string, options: ShardProofOptions = {}, ports: ShardProofPorts = defaultPorts): Promise<ShardProof> {
  const { product, assets } = await ports.admit(directory, options.mode ?? 'full');
  const descriptor = outputDescriptor(product.shardfile);
  if (descriptor === undefined) throw new Error(`Not a built shard folder: ${directory}`);
  const rapier = await ports.rapier();
  const resident = await ports.resident({ shard: product.shardfile, assets, product, rapier, sections: folderHeadlessSections(product) }, options.prepare ?? prepareFolderPlan, options.snapshot);
  const { host } = resident;
  return {
    product, assets, rapier, resident, host, descriptor,
    lead: () => leadPlayer(host),
    // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- engine's tick command rows, passed through as is.
    step: (commands: readonly HeadlessCommand[] = []) => { resident.step(commands); },
    snapshot: () => serializeSimSnapshot(snapshotSimHostBytes(host)),
    digest: () => canonicalSimDigest(snapshotSimHostBytes(host)),
    dispose: () => { resident.dispose(); },
  };
}

/** A quest-level world: the shard's declared simulation with its quest host, vehicles and act routes, booted from a
 *  cooked or built folder's server files. For tapes that place the player, claim acts and judge quest steps. */
export interface ShardSim {
  readonly shardfile: ShardFolder['shardfile'];
  readonly sim: ShardfileSimulation;
  /** The folder's index and baked sections (`descriptor.sections.get('world/vehicles')`). */
  readonly descriptor: NonNullable<ReturnType<typeof outputDescriptor>>;
  readonly host: SimHost;
  /** Every player's quest book; `.lead` is the first player's. */
  readonly books: () => ReturnType<typeof questBooks>;
  /** Run a native act route (`talk:0.start`, `<dock>.dock`) for a player (the lead by default), then one tick. */
  readonly claim: (id: string, player?: string) => void;
  /** Every `fact` and `coins` the quest host granted, in order. */
  readonly facts: readonly Readonly<{ name: string; who: string }>[];
  readonly coins: readonly Readonly<{ amount: number; who: string }>[];
}
export interface ShardSimOptions {
  /** The pinned physics wasm, else `nativeRapierFile`. */
  readonly physics?: string;
  /** Called after each grant is recorded, for a ledger or a save. */
  readonly fact?: QuestDataPorts['fact'];
}

/** Boot a folder's declared simulation with its quest host. */
export async function openShardSim(folder: string, options: ShardSimOptions = {}): Promise<ShardSim> {
  const { shardfile } = await loadHeadlessFolder(folder);
  const descriptor = outputDescriptor(shardfile);
  if (descriptor === undefined) throw new Error(`Not a built shard folder: ${folder}`);
  const assets = new Map(serverInputFiles(descriptor.index.files, shardfile).map(file => [
    file.commons === true ? `commons:${file.hash}` : file.hash, Uint8Array.from(readFileSync(`${folder}/${file.path}`)),
  ] as const));
  const facts: { name: string; who: string }[] = [], coins: { amount: number; who: string }[] = [];
  const rapier = await loadRapier(readFileSync(options.physics ?? nativeRapierFile));
  const sim = createShardfileSim(shardfile, assets, { rapier, sections: descriptor.sections, quest: {
    fact: (name, who) => { facts.push({ name, who }); options.fact?.(name, who); },
    coins: (amount, who) => { coins.push({ amount, who }); },
  } });
  const { host } = sim;
  return {
    shardfile, sim, host, facts, coins, descriptor,
    books: () => questBooks(host),
    claim: (id, player = questBooks(host).lead.player) => {
      const route = actRoutes(host).claims.get(id);
      if (route === undefined) throw new Error(`No native claim for ${id}`);
      route(player);
      host.step();
    },
  };
}

/** A fresh in-memory quest ledger for one save slot: what a grant pays into, as the server keeps it. */
export function questLedger(shardfile: ShardFolder['shardfile'], slot: string): ReturnType<typeof createQuestLedger> {
  return createQuestLedger(new SaveStore(), shardfile, slot);
}
