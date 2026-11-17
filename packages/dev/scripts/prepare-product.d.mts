/** J198: what `wildshard prepare` records in phone WebKit; tests pass a fixture recording. */
export interface PreparationRecording {
  readonly headerHash: string;
  readonly renderer: string;
  readonly reads: readonly string[];
  readonly hashes?: readonly string[];
  readonly programs: unknown;
}
/** Finish preparing the exact candidate in `dir` from a recording: sdk 0.3 with a version 3 cook, validated. */
export function finishPreparation(dir: string, recording: PreparationRecording, originalHeader: Uint8Array): Promise<{ slug: string; fence: number; programs: number; renderer: string; document: string }>;
/** Record the candidate served at `base` in phone WebKit, then finish its preparation. */
export function prepareProduct(dir: string, base: string): Promise<{ slug: string; fence: number; programs: number; renderer: string; document: string }>;
/** The producer's dependency fence plus the recording's cold reads. */
export function preparationFence(index: unknown, sections: ReadonlyMap<string, unknown>, recording: PreparationRecording, mounts: readonly unknown[]): string[];
