// oxlint-disable-next-line import/no-nodejs-modules -- dev's and watch's loopback servers take the page's posts.
import type { IncomingMessage, ServerResponse } from 'node:http';

// meta MMO-OBSERVABILITY OB10b (F33): the page posts its errors to `/api/errors` and its telemetry to `/api/telemetry`
// on its own origin. `wildshard dev` and `watch` answered both with 405, so a shard author's page errors went nowhere.
// Both servers now take them (204) and print each error in the terminal; telemetry is taken and dropped.

const ERRORS = '/api/errors';
const TELEMETRY = '/api/telemetry';
/** The engine caps a report's message at 500 characters and its stack at 4,000; anything past this is not a report. */
const MAX_BODY = 65_536;
const STACK_LINES = 3;

/** One terminal line (and up to three stack lines) for an engine error report; undefined when the body is not one. */
export function pageErrorLine(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('message' in body) || typeof body.message !== 'string') return undefined;
  const system = 'system' in body && typeof body.system === 'string' && body.system !== '' ? body.system : 'page';
  const fatal = 'fatal' in body && body.fatal === true ? ' (fatal)' : '';
  const stack = 'stack' in body && typeof body.stack === 'string' ? body.stack.split('\n').map((line) => line.trim())
    .filter((line) => line !== '' && line !== body.message).slice(0, STACK_LINES) : [];
  return [`page error [${system}]${fatal}: ${body.message}`, ...stack.map((line) => `  ${line}`)].join('\n');
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => { text += chunk; if (text.length > MAX_BODY) { request.destroy(); reject(new Error('page report too large')); } });
    request.on('end', () => { resolve(text); });
    request.on('error', reject);
  });
}

/** Take a page's error or telemetry post: true when this request was one (answered 204, or 413 when too large). */
export function takePageReport(path: string, request: IncomingMessage, response: ServerResponse, log: (line: string) => void, prefix: string): boolean {
  if (request.method !== 'POST' || (path !== ERRORS && path !== TELEMETRY)) return false;
  answer(path, request, response, (line) => { log(`${prefix}: ${line}`); }).catch(() => { response.destroy(); });
  return true;
}

async function answer(path: string, request: IncomingMessage, response: ServerResponse, log: (line: string) => void): Promise<void> {
  let text: string;
  try { text = await readBody(request); } catch { response.writeHead(413); response.end(); return; }
  if (path === ERRORS) {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = undefined; }
    const line = pageErrorLine(parsed);
    if (line !== undefined) log(line);
  }
  response.writeHead(204); response.end();
}
