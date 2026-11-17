/** Wall-clock time for build, check and watch diagnostics (phase timings, step durations); never shard output or a
 *  simulation input. The sdk's own copy of the engine's `core/clock` `diagnosticNow` (SDK-SPLIT SP7a), so the build and
 *  check no longer load the engine for a timer. */
export function diagnosticNow(): number {
  // oxlint-disable-next-line wildshard/no-raw-random-time -- a diagnostic timer: it times the build itself and nothing built reads it
  return performance.now();
}
