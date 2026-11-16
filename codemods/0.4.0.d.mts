export function rewriteKitImports(source: string): string;
// oxlint-disable-next-line import/no-default-export -- Match the release loader's default codemod export.
export default function codemod(move: Readonly<{ project: string; from: string; to: string }>): string[];
