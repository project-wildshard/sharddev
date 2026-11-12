// The save a fresh `wildshard prepare` context starts from (SENTRY-TRIAGE S12): the phone tier, quiet, and a device that has
// played and answered the Name prompt, so PLAY goes straight to SHARD SELECT on engine main (firstPlay.ts, MP2.4).
import { NAME_ASKED } from '@wildshard/engine/scripts/debug-settings.mjs';

/** localStorage rows by key, for the served save epoch. @param {number} epoch @returns {Record<string, string>} */
export function preparationSaveSeed(epoch) {
  const prefix = `wildshard.save.v2${epoch === 0 ? '' : `@${epoch}`}.`, row = (/** @type {unknown} */ data) => ({ v: 1, data });
  return {
    [`${prefix}global`]: JSON.stringify({ keys: { settings: row({ tier: 'phone', volume: 0, time: 'midday', weather: 'clear' }), gfx: row({ dpr: '2', aa: 'auto' }) } }),
    [`${prefix}${NAME_ASKED.scope}`]: JSON.stringify({ keys: {
      devMode: row(true), firstPlayDone: row(true), [NAME_ASKED.key]: row(NAME_ASKED.data),
      'debug.global.holdLoading': row('off'), 'debug.earlyPrograms': row('off'),
    } }),
  };
}
