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
  it('CP11 (J522): makes the page a one-cell world, the shard at (0, 0), keeping the rest of the catalogue', () => {
    const catalogue = { placements: [{ slug: 'pine-hollow' }], grid: { version: 0, pitch: 562.5, cells: [{ instance: 'pine-hollow', slug: 'pine-hollow', cell: [0, 1] }, { instance: 'glowfen', slug: 'glowfen', cell: [1, 0] }] } };
    const html = `<html><head><script type="application/json" id="ws-catalogue">${JSON.stringify(catalogue)}</script></head><body></body></html>`;
    const read = (out: string): unknown => JSON.parse(/id="ws-catalogue">([^<]*)</u.exec(out)?.[1] ?? 'null');
    expect(read(clientPage(html, '{}', 'isle', true))).toEqual({ ...catalogue, grid: { version: 0, pitch: 562.5, cells: [{ instance: 'isle', slug: 'isle', cell: [0, 0] }] } });
    expect(clientPage(html, '{}', 'a<b', true)).toContain(`"slug":"a${String.fromCodePoint(92)}u003cb"`);
    expect(clientPage(page('{}'), '{}', 'isle', true), 'a client with no catalogue gets none').not.toContain('ws-catalogue');
  });
  it('leaves the bank alone when the programs are recorded', () => {
    expect(bank(clientPage(page('{"common":[]}'), '{}', 'isle', true))).toEqual({ common: [] });
  });
});
