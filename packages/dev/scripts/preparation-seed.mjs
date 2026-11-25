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

/** FAST-RELEASE FR-A18: the pixel density the recorder's phone context draws at. The iPhone 16 Pro's is 3, but the recorded
 * programs don't depend on it (Nalati on the MacBook: byte-identical cook.json at 1 and 3, 113 programs), and a Linux
 * runner draws every pixel in software (Nalati's entry: 210 to 260 s there, 40 to 48 s on macos-15). The phone renderer
 * draws at min(density, 2), so 1 is a quarter of the pixels. WILDSHARD_PREPARATION_DENSITY (above 0, at most 3) overrides it.
 * @param {Record<string, string | undefined>} [env] @returns {number} */
export function preparationDensity(env = process.env) {
  const value = env['WILDSHARD_PREPARATION_DENSITY'];
  if (value === undefined || value === '') return 1;
  const density = Number(value);
  if (!(density > 0 && density <= 3)) throw new Error('WILDSHARD_PREPARATION_DENSITY is a pixel density above 0 and at most 3');
  return density;
}
