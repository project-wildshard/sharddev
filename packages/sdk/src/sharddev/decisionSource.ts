import { loadAssemblyScriptParser } from './assemblyscriptCompiler.mjs';
import type { DecisionScriptRow } from '@wildshard/format/decisionScripts';
import { DECISION_HANDLERS } from './decisionScriptBindings';

interface Parser {
  onComment: ((kind: number, text: string, range: { start: number; end: number }) => void) | null;
  parseFile: (text: string, path: string, entry: boolean) => void;
  diagnostics: readonly unknown[];
  sources: readonly { statements: readonly unknown[] }[];
}
interface ParserModule { Parser: new () => Parser }
function parserModule(value: unknown): value is ParserModule {
  return typeof value === 'object' && value !== null && 'Parser' in value && typeof value.Parser === 'function';
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid AssemblyScript syntax tree');
  return Object.fromEntries(Object.entries(value));
}
/** Count the pinned parser's source lines; comment-looking text inside strings remains authored code. */
export async function inspectDecisionSource(text: string, path: string): Promise<{ lines: number; handlers: readonly string[]; imports: readonly string[] }> {
  if (text.length > 1_000_000) throw new Error('AssemblyScript source exceeds byte cap');
  const module = await loadAssemblyScriptParser();
  if (!parserModule(module)) throw new Error('Invalid pinned AssemblyScript parser');
  const parser = new module.Parser(), spans: { start: number; end: number }[] = [];
  parser.onComment = (_block, _text, range) => { spans.push({ start: range.start, end: range.end }); };
  parser.parseFile(text, path, true);
  if (parser.diagnostics.length > 0) throw new Error(`Invalid AssemblyScript source: ${path}`);
  const handlers: string[] = [], imports: string[] = [];
  for (const source of parser.sources) for (const statement of source.statements) {
    const node = record(statement);
    if (node['kind'] === 56 && typeof node['flags'] === 'number' && (node['flags'] & 2) !== 0) {
      const name = record(node['name'])['text'];
      if (typeof name !== 'string') throw new Error('Invalid AssemblyScript function name');

      if (/^on[A-Z]/u.test(name)) handlers.push(name);
    }
    if (node['kind'] === 43) {
      const name = record(node['path'])['value'];
      if (typeof name !== 'string') throw new Error('Invalid AssemblyScript import');
      imports.push(name);
    }
  }
  let cleaned = text;
  for (const span of spans.sort((a, b) => b.start - a.start)) cleaned = cleaned.slice(0, span.start) + cleaned.slice(span.start, span.end).replaceAll(/[^\r\n]/gu, ' ') + cleaned.slice(span.end);
  return { lines: cleaned.split(/\r?\n/u).filter(line => line.trim().length > 0).length, handlers, imports };
}
/** A subscription must have exactly its named exported handler; extra handlers never silently sleep. */
export function checkDecisionHandlers(row: DecisionScriptRow, handlers: readonly string[]): void {
  const expected = new Set(row.on.map(event => DECISION_HANDLERS[event].name));
  if (handlers.length !== expected.size || handlers.some(name => !expected.has(name)) || new Set(handlers).size !== handlers.length) throw new Error(`Decision handlers must match on: ${[...expected].join(', ')}`);
}
