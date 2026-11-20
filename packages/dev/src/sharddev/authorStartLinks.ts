/** Leave the first line stable for scripts that consume the walk-in URL. */
export function authorStartLinks(
  command: 'dev' | 'watch',
  url: string,
): readonly [string, string] {
  const label = `wildshard ${command}:`
  return [
    `${label} ${url}?skipintro`,
    `${label} explore (fly, inspect) ${url}?explore=world`,
  ]
}
