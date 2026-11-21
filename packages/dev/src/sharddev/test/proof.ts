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
