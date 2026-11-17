// oxlint-disable-next-line import/no-nodejs-modules -- Compile the shared build-only course source.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Encode compiled immutable program bytes in the existing JSON envelope.
import { Buffer } from 'node:buffer';
import { compileDecisionScripts } from '@wildshard/sdk/buildDecisionScripts';
import type { DecisionScriptRow } from '@wildshard/format/decisionScripts';
import { courseProgramInputs } from './courseProgram';

/** One bounded course law; raw authoring returns the existing compiled binary instead of encoding it. Legacy defaults stay exact. */
export async function buildCourseProgram(kind: 'oval' | 'checkpoints', parameters: Readonly<Record<string, number>> = {}, raw=false): Promise<{ script: DecisionScriptRow; bytes: string; readonly binary?:Uint8Array }> {
  const { row, registries, source, options } = courseProgramInputs(kind, parameters);
  const built = await compileDecisionScripts([row], registries,
    new Map([[source,readFileSync(new URL('scripts/course.as',import.meta.url),'utf8')]]), options);
  const script=built.rows[0],blob=built.blobs[0];if(script===undefined||blob===undefined)throw new Error('Missing shared course program');
  return raw?{script,bytes:'',binary:blob.bytes}:{ script,bytes:Buffer.from(blob.bytes).toString('base64') };
}
