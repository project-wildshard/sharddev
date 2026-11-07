// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { Scope } from '../src/shared/engine/app/scope';
import { parsePanelDefinition } from '@wildshard/format/panelTemplate';
import { DataPanel, readDataPanels } from '../src/client/game/ui/dataPanels';
import { expandPanelTemplates } from '../src/client/game/ui/panelTemplates';
import { PINE_PANELS } from '../src/shards/pine-hollow/generators/panels';
import horsePanel from '../src/shards/nalati-grasslands/data/namePanel.json' with { type: 'json' };

test('a transient count refresh replaces its hide clock and retires on scope disposal', () => {
  vi.useFakeTimers();
  const scope = new Scope('count-test'), panel = new DataPanel(PINE_PANELS.count, { scope });
  try {
    panel.show({ label: 'Amber resin', n: 4, of: 30 });
    expect(panel.view.node('label').textContent).toBe('Amber resin'); expect(panel.view.node('n').textContent).toBe('4 / 30');
    expect(panel.root.classList.contains('show')).toBe(true); expect(panel.root.classList.contains('full')).toBe(false);
    vi.advanceTimersByTime(3000); panel.show({ label: 'Carved tokens', n: 8, of: 8 });
    vi.advanceTimersByTime(600); expect(panel.root.classList.contains('show')).toBe(true); expect(panel.root.classList.contains('full')).toBe(true);
    vi.advanceTimersByTime(3000); expect(panel.root.classList.contains('show')).toBe(false);
    scope.dispose(); panel.show({ label: 'Late', n: 0, of: 1 }); expect(panel.root.isConnected).toBe(false);
  } finally { scope.dispose(); vi.useRealTimers(); }
});

test('program admission refuses unsafe paths, deep trees and unbounded expansions', () => {
  for (const text of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) expect(() => parsePanelDefinition({ lifetime: 'persistent', frame: { text } })).toThrow();
  const definition = { lifetime: 'persistent', frame: { cls: { read: 'constructor.prototype' } } };
  expect(() => parsePanelDefinition(definition)).toThrow();
  expect(() => parsePanelDefinition({ lifetime: 'persistent', frame: { attrs: [['onclick', 'run()']] } })).toThrow();
  let nested: unknown = {};
  for (let i = 0; i < 34; i++) nested = { children: [nested] };
  expect(() => parsePanelDefinition({ lifetime: 'persistent', frame: nested })).toThrow('bound');
  const rows = [{ repeat: { source: 'count', as: 'item' }, cls: '' }];
  expect(() => expandPanelTemplates(rows, { count: 257 })).toThrow('bound');
  expect(() => expandPanelTemplates(rows, { count: -1 })).toThrow('repeat');
});

test('named panel content admits both real shard consumers through one product reader', async () => {
  for (const rows of [PINE_PANELS, { name: horsePanel }]) {
    const names: string[] = [];
    const parsed = await readDataPanels({ file: name => { names.push(name); return Promise.resolve(new TextEncoder().encode(JSON.stringify(rows))); } });
    expect(names).toEqual(['quests/panels.json']); expect(Object.keys(parsed)).toEqual(Object.keys(rows));
  }
});
