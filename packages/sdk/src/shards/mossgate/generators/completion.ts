// MZ35: Mossgate's completion card, the card the grid cell opens once the Lamplighter's chain is done (the Warden down,
// then the report), as the Template's does on its quest.
import type { CompletionRows } from '@wildshard/format/completion';
import { FLAGS } from './quests';

export const MOSSGATE_COMPLETION: CompletionRows = {
  doneFlag: FLAGS.lampDone, seenFlag: 'mossgate.complete.seen', trigger: 'quest', system: 'game.completion',
  before: ['main.world'], after: [], title: 'Mossgate Hollow',
  card: { kicker: 'The Hollow · relit', flavour: ['The Barrow Warden is down and the lanterns burn again.', 'The Hollow is still yours to walk.'] },
  menuSubtitle: 'Your Hollow · the time and what you earned', toastSuffix: ' complete · open the menu to see your Hollow',
  safeRadius: 25, pollSeconds: 1, maximumTodo: 7, more: 'more', coveredEvents: [], groups: [],
  stats: [{ label: 'Time played', value: { kind: 'time' } }, { label: 'Achievements', value: { kind: 'achievements' } }],
};
