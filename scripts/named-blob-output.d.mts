import type { ScriptContract } from '@wildshard/format/scriptContract';
import type { NamedBlobKind } from '../src/sharddev/blobs';

/** Register exact bytes as cached author-project inputs; directory is assets or a bounded subdirectory. */
export function namedBlobOutput(project: URL, label: string, directory?: string): {
  readonly add: (name: string, kind: NamedBlobKind, bytes: Uint8Array, url?: string, script?: ScriptContract, jsonSchema?: Readonly<Record<string, unknown>>) => string;
  readonly finish: (metadata: URL) => void;
};
