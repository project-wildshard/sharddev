// `wildshard check`'s admission line (meta SHARD-COMPAT CP7, J486): what the API will do with the built shard file.
// GET /api/format names the API's format; a file at it is taken as is, a newer one waits for the API, and an older one
// asks POST /api/shardfiles/dry-run (the API's preflight, api-server CP7a) which migrations admission would run. No
// answer is never a failure: the line says "offline: local format only".
// oxlint-disable-next-line import/no-nodejs-modules -- The built folder's index and the written shard file are local files.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The index sits in the built folder.
import { resolve } from 'node:path';
import * as v from 'valibot';
import { compareShardfileVersions } from '@wildshard/format/version';

/** Where the API is and how to reach it; tests pass their own fetch. */
export interface AdmissionApi { readonly server: string; readonly fetch?: typeof fetch; readonly timeoutMs?: number }

const FormatSchema = v.object({ current: v.string() });
const DryRunSchema = v.object({ apiFormat: v.string(), migrations: v.array(v.string()), deprecations: v.optional(v.array(v.string())) });
const RefusalSchema = v.object({ error: v.string() });
const TIMEOUT_MS = 10_000;

/** The format the built folder's index declares: `formatVersion` from 0.1.0.2, else the legacy `version`. */
export function declaredFormat(folder: string): string {
  const index: unknown = JSON.parse(readFileSync(resolve(folder, 'shard.json'), 'utf8'));
  const fields = typeof index === 'object' && index !== null ? index : {};
  const named: unknown = 'formatVersion' in fields && typeof fields.formatVersion === 'string' ? fields.formatVersion : 'version' in fields ? fields.version : undefined;
  if (typeof named !== 'string') throw new Error(`${folder}/shard.json names no format version`);
  return named;
}

async function asked(api: AdmissionApi, path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown } | undefined> {
  try {
    const reply = await (api.fetch ?? fetch)(new URL(path, api.server), { ...init, signal: AbortSignal.timeout(api.timeoutMs ?? TIMEOUT_MS) });
    return { status: reply.status, body: await reply.json() as unknown };
  } catch { return undefined; }
}

const listed = (ids: readonly string[]): string => (ids.length === 0 ? 'none' : ids.join(', '));

/** The dry run's line for a file older than the API's format. */
async function olderLine(api: AdmissionApi, file: string, format: string, current: string): Promise<string> {
  const reply = await asked(api, '/api/shardfiles/dry-run', { method: 'POST', headers: { 'content-type': 'application/x-tar' }, body: readFileSync(file) });
  // An API from before CP7a has no dry run (404): the line says so rather than call it a refusal.
  if (reply === undefined || reply.status === 404) return `format ${format}, the API is at ${current}; no dry run answered, local format only`;
  const ran = v.safeParse(DryRunSchema, reply.body);
  if (reply.status === 200 && ran.success) {
    const { migrations, deprecations = [] } = ran.output;
    return `format ${format}, the API is at ${ran.output.apiFormat}: admission will migrate (${listed(migrations)}); deprecated: ${listed(deprecations)}`;
  }
  const refused = v.safeParse(RefusalSchema, reply.body);
  return `format ${format}, the API is at ${current}: the API refuses it (${refused.success ? refused.output.error : `HTTP ${reply.status}`})`;
}

/** The line: the built folder's format against the API's, and what admission will do with the written file. */
export async function admissionLine(folder: string, file: string, api: AdmissionApi): Promise<string> {
  const format = declaredFormat(folder);
  const reply = await asked(api, '/api/format');
  const read = reply === undefined ? undefined : v.safeParse(FormatSchema, reply.body);
  if (read === undefined || !read.success) return `format ${format}; offline: local format only`;
  const { current } = read.output, order = compareShardfileVersions(format, current);
  if (order > 0) return `format ${format} is newer than the API's ${current}: upload waits until the API updates`;
  if (order === 0) return `format ${format}, the API is at ${current}: admission takes it as is; deprecated: none`;
  return await olderLine(api, file, format, current);
}
