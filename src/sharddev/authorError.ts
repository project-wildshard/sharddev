/** A schema's refusal says what was wrong, and only its path says where. Plain shapes: a bundle's valibot isn't ours. */
interface PathStep {readonly key?: unknown}
interface Refusal {readonly message: string; readonly path?: readonly PathStep[]}

const MAX_SHOWN = 5;
const isRefusal = (value: unknown): value is Refusal => typeof value === 'object' && value !== null && 'message' in value;
function refusalsOf(error: unknown): readonly Refusal[] | undefined {
  if (typeof error !== 'object' || error === null || !('issues' in error) || !Array.isArray(error.issues)) return undefined;
  const issues: readonly unknown[] = error.issues;
  return issues.filter(isRefusal);
}
function located(issue: Refusal): string {
  const path = (issue.path ?? []).map(step => (typeof step.key === 'number' ? `[${step.key}]` : `.${String(step.key)}`)).join('').replace(/^\./u, '');
  return path === '' ? issue.message : `${path}: ${issue.message}`;
}

/** An author-facing line: each refused field with its path, or the error's own words. */
export function authorErrorText(error: unknown): string {
  const issues = refusalsOf(error);
  if (issues === undefined) return error instanceof Error ? error.message : String(error);
  const shown = issues.slice(0, MAX_SHOWN).map(issue => located(issue)), more = issues.length - shown.length;
  return `${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}`;
}

/** The same error with its fields located, or the error itself if nothing was refused by a schema. */
export function locatedError(error: unknown, prefix = ''): unknown {
  return refusalsOf(error) === undefined ? error : new Error(`${prefix}${authorErrorText(error)}`, { cause: error });
}
