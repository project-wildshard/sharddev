// SHARD-COMPAT ST19b (J486 for the SDK): a renamed SDK export keeps its old name for at least one release as an alias
// that says so once per process, so a shard repo builds on it and sees what to change (scripts/sdk-exports.mjs alias).
// oxlint-disable-next-line import/no-nodejs-modules -- An alias warns through Node's own deprecation channel.
import process from 'node:process'

const warned = new Set<string>()

/** Warn once that `old` is a deprecated alias of `next`, shipped as one since SDK `since`. */
export function warnDeprecatedExport(
  old: string,
  next: string,
  since: string,
): void {
  if (warned.has(old)) {
    return
  }
  warned.add(old)
  const message = `${old} is deprecated since @wildshard/sdk ${since}: import ${next} instead`
  process.emitWarning(message, 'DeprecationWarning')
}
