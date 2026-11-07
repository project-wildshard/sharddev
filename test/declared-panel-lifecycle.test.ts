// @vitest-environment happy-dom
import { CONTRACTS } from './fixtures/pine-contracts';
import { expect, test, vi } from 'vitest';
import { Scope } from '../src/shared/engine/app/scope';
import { app } from '../src/client/engine/app/runtime';
import { DataPanel } from '../src/client/game/ui/dataPanels';
import { PINE_PANELS } from '../src/shards/pine-hollow/generators/panels';
import { parsePanelDefinition } from '@wildshard/format/panelTemplate';
import horsePanel from '../src/shards/nalati-grasslands/data/namePanel.json' with { type: 'json' };
import { claim, newBoard, reroll } from '../src/shared/game/quest/contracts';
import { cleanMountName } from '@wildshard/format/riding';

test('the persistent lodge board retains its frame, payouts, keys and scoped row listeners', () => {
  const scope = new Scope('board-lifecycle'), board = newBoard(CONTRACTS), events: string[] = [];
  const panel = new DataPanel(PINE_PANELS.board, { scope, values: () => board, actions: new Map([
    ['claim', value => { const i = Number(value); events.push(`claim:${i}`); expect(claim(CONTRACTS, board, i)).not.toBeNull(); }],
    ['tear', value => { const i = Number(value); events.push(`tear:${i}`); reroll(CONTRACTS, board, i); }],
  ]) });
  const first = board.slots[0];
  if (first === undefined) throw new Error('Missing first contract');
  first.have = first.need;
  panel.onOpen = () => { events.push(`open:${panel.isOpen}`); };
  panel.onClose = () => { events.push(`close:${panel.isOpen}`); };
  try {
    const root = panel.root;
    expect(root.isConnected).toBe(true); expect(panel.isOpen).toBe(false);
    expect(root.querySelector('.ws-ph-title')?.textContent).toBe('Contracts');
    expect(root.querySelector('.ws-ph-kicker')?.textContent).toBe('The hunting lodge');
    panel.open(); panel.open();
    expect(root.classList.contains('show')).toBe(true);
    const oldClaim = panel.view.node('claim.0'); oldClaim.click(); oldClaim.click();
    expect(board.claimed).toBe(1); expect(events.filter(event => event.startsWith('claim:'))).toEqual(['claim:0']);
    const oldTear = panel.view.node('tear.0'); oldTear.click(); oldTear.click();
    expect(events.filter(event => event.startsWith('tear:'))).toEqual(['tear:0']);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', repeat: true }));
    expect(panel.isOpen).toBe(true);
    const use = new KeyboardEvent('keydown', { code: 'KeyE', cancelable: true }); document.dispatchEvent(use);
    expect(use.defaultPrevented).toBe(true); expect(panel.isOpen).toBe(false);
    expect(root.isConnected).toBe(true); expect(root.classList.contains('show')).toBe(false);
    const content = root.textContent; panel.open(); expect(root.textContent).toBe(content);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    panel.open(); panel.view.node('close').click(); panel.close();
    expect(events.filter(event => event.startsWith('open:') || event.startsWith('close:')))
      .toEqual(['open:true', 'close:false', 'open:true', 'close:false', 'open:true', 'close:false']);
    panel.open(); scope.dispose(); panel.open();
    expect(panel.isOpen).toBe(false); expect(root.isConnected).toBe(false);
  } finally { scope.dispose(); }
});

test('the horse-name data preserves submit, focus, grace, layer ownership and fresh open scopes', () => {
  const owner = new Scope('horse-panel-lifecycle'), saves: string[] = [];
  const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
  const panel = new DataPanel(parsePanelDefinition(horsePanel), { scope: owner });
  const save = new Map([['save', (value: unknown) => { const name = cleanMountName(String(value), 16); if (name.length > 0) saves.push(name); }]]);
  try {
    panel.open({ current: 'Camp horse' }, save);
    const first = panel.view;
    expect(document.activeElement).toBe(first.node('input')); expect(app.ui.top).toBe('modal');
    const early = new InputEvent('beforeinput', { cancelable: true }); first.node('input').dispatchEvent(early);
    expect(early.defaultPrevented).toBe(true);
    now.mockReturnValue(1200);
    const later = new InputEvent('beforeinput', { cancelable: true }); first.node('input').dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
    let released = false; owner.listen(document, 'keyup', () => { released = true; });
    first.node('input').dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'KeyW' }));
    expect(released).toBe(true);
    let leaked = false;
    owner.listen(document, 'keydown', () => { leaked = true; });
    first.node('input').dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Enter', cancelable: true }));
    expect(leaked).toBe(false); expect(saves).toEqual(['Camp Horse']); expect(first.root.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(first.node('input')); expect(app.ui.top).not.toBe('modal');
    first.node('save').click(); expect(saves).toHaveLength(1);
    panel.open({ current: 'Second horse' }, save);
    expect(panel.view).not.toBe(first); expect(panel.view.value('input')).toBe('Second horse');
    panel.view.node('cancel').click(); expect(saves).toHaveLength(1);
    panel.open({ current: 'Third horse' }, save); owner.dispose();
    expect(panel.isOpen).toBe(false); expect(() => panel.view).toThrow('no mounted view'); expect(app.ui.top).not.toBe('modal');
    panel.open(); expect(panel.isOpen).toBe(false);
  } finally { owner.dispose(); }
});
