// oxlint-disable-next-line import/no-nodejs-modules -- Build hosts observe counters without entering product data or cache keys.
import { channel } from 'node:diagnostics_channel';

/** Successful cache payload bytes; no duration, compression ratio or admission authority is inferred. */
interface BuildCacheMetric {
  readonly version: 1;
  readonly cache: 'assemblyscript-raw' | 'zstd-bytes' | 'generation-step';
  readonly event: 'lookup' | 'disk-hit' | 'memory-hit' | 'miss' | 'computed' | 'population' | 'bypass' | 'write-failure' | 'population-race';
  readonly bytes: number;
  readonly project?: string;
  readonly step?: string;
}
const metrics = channel('wildshard.build-cache');
/** Diagnostics only. The CLI subscribes once and prints a batch after critical work. */
export function reportBuildCache(metric: Omit<BuildCacheMetric, 'version'>): void {
  if (metrics.hasSubscribers) metrics.publish({ version: 1, ...metric });
}
