// Body reads the prepare recorder starts from a `page.on('response')` handler (SF7c, 11-27). A response that lands
// after the recorder has awaited its reads, or while its context closes, rejects with "Target page, context or browser
// has been closed"; unawaited, that rejection killed the recorder (Nine Dragon, sdk 0.9.1) and hid the real verdict.
// `settle` turns each read into a promise that never rejects; `settledValues` drops reads cut short by a closed target
// and rethrows any other failure where the recorder awaits them.

/** True for Playwright's error when the page, context or browser closed under a pending read. */
export function closedTarget(error) {
  return /Target (page, context or browser has been )?closed/u.test(String(error?.message ?? error));
}

/** The read as a promise that never rejects: `{ value }` or `{ error }`. */
export function settle(promise) {
  return Promise.resolve(promise).then((value) => ({ value }), (error) => ({ error }));
}

/** The values of settled reads; a read cut short by a closed target is dropped, any other failure is thrown. */
export function settledValues(results) {
  const values = [];
  for (const result of results) {
    if (!('error' in result)) values.push(result.value);
    else if (!closedTarget(result.error)) throw result.error;
  }
  return values;
}
