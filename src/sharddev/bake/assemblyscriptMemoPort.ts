/** A build-host cache of only the raw compiler output. All executable admission stays with the caller. */
export type AssemblyScriptMemo = (
  args: readonly string[], sources: ReadonlyMap<string, string>, generate: () => Promise<Uint8Array>
) => Promise<Uint8Array>;
