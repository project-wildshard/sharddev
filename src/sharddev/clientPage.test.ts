import { describe, expect, it } from 'vitest';
import { clientPage } from './clientPage';

const bank = (html: string): unknown => JSON.parse(/id="boot-module-files">([^<]+)</u.exec(html)?.[1] ?? 'null');
const page = (json: string): string => `<html><head><script type="application/json" id="boot-module-files">${json}</script></head><body></body></html>`;

describe('clientPage', () => {
  it('adds the descriptor before </head>', () => {
    expect(clientPage(page('{}'), '{"a":1}', 'isle', true)).toContain('<script id="ws-shardfile" type="application/json">{"a":1}</script></head>');
  });
  it('marks a shard with no recorded programs, so the page never reads programs/<slug>.json', () => {
    expect(bank(clientPage(page('{"common":[]}'), '{}', 'isle', false))).toEqual({ common: [], entryPrograms: { isle: false } });
    expect(bank(clientPage(page('{"entryPrograms":{"template":true}}'), '{}', 'isle', false))).toEqual({ entryPrograms: { template: true, isle: false } });
  });
  it('keeps $ patterns literal and escapes < inside the bank', () => {
    expect(clientPage(page('{}'), '{"name":"$&"}', 'isle', true)).toContain('{"name":"$&"}</script></head>');
    expect(clientPage(page('{}'), '{}', 'a<b', false)).toContain(`"a${String.fromCodePoint(92)}u003cb":false`);
  });
  it('leaves the bank alone when the programs are recorded', () => {
    expect(bank(clientPage(page('{"common":[]}'), '{}', 'isle', true))).toEqual({ common: [] });
  });
});
