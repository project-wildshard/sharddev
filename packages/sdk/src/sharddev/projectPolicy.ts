// oxlint-disable-next-line import/no-nodejs-modules -- Author-only project policy is an optional bounded build input.
import { existsSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The policy must remain inside the author project.
import { resolve, sep } from 'node:path';
import * as v from 'valibot';
import { readBoundedFile } from './sourceReader';

const policy = v.strictObject({ version: v.literal(1), decisionLegacyLines: v.pipe(v.number(), v.safeInteger(), v.minValue(1)) });
/** A portable generated policy input carries the first-party denominator to every project reader.
 * The SDK never imports repository policy or guesses a first-party identity from a folder name. */
export function projectDecisionBudget(project: string, explicit?: number): number | undefined {
  if (explicit !== undefined) return explicit;
  const root = realpathSync(project), path = resolve(root, '.wildshard/build-policy.json');
  if (!existsSync(path)) return undefined;
  if (!realpathSync(path).startsWith(`${root}${sep}`)) throw new Error('Project build policy escapes the project');
  return v.parse(policy, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(path, 4096)))).decisionLegacyLines;
}
