// oxlint-disable-next-line import/no-nodejs-modules -- Only the CLI owns async producer scope; config-reachable producers do not import this module.
import { AsyncLocalStorage } from 'node:async_hooks';
import { immutableAsset } from './assetHandle';

import type { OwnedAsset } from './assetOwner';

type Factory = (input: Uint8Array) => OwnedAsset;
interface ScopePort { readonly current: () => Factory | undefined }
const slot = Symbol.for('wildshard.sdk.asset-owner.v1');
const scope = new AsyncLocalStorage<Factory>();
const port: ScopePort = Object.freeze({ current: (): Factory | undefined => scope.getStore() });
let active = 0;

function own(input: Uint8Array): OwnedAsset {
  const asset = immutableAsset(input);
  return { bytes: asset.copy(), hash: asset.hash };
}

/** Explicit author-only ownership scope; importing a module installs nothing.
 * Its frozen port exposes the active factory, never the private snapshot table.
 * Canonical format hash/verification functions do not consult this port. */
export async function withAssetOwner<T>(work: () => Promise<T>): Promise<T> {
  const present: unknown = Reflect.get(globalThis, slot);
  if (present !== undefined && present !== port) return work();
  if (present === undefined) Object.defineProperty(globalThis, slot, { value: port, configurable: true });
  active++;
  try { return await scope.run(own, work); }
  finally { if (--active === 0 && Reflect.get(globalThis, slot) === port) Reflect.deleteProperty(globalThis, slot); }

}
