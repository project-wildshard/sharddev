import path from 'node:path'

// SDK-SPLIT SP-NE1 (NEW-SHARD-E2E F1): in a folder with no package.json,
// `npm install @wildshard/sdk` installs into the nearest folder above that
// has one, often the home folder, so the intended folder stays empty and
// `npx wildshard` quietly runs the home folder's copy. The GUIDE says to run
// `npm init -y` first; this is the CLI saying it at the moment it matters.

interface Install {
  /** The running sdk's package folder (bin's parent). */
  readonly sdk: string
  readonly cwd: string
  readonly home: string
}

/** The folder whose node_modules holds the sdk, through pnpm's store paths. */
function installingFolder(sdk: string): string | undefined {
  const normal = path.normalize(sdk)
  const marker = `${path.sep}node_modules${path.sep}`
  const [folder] = normal.split(marker)
  return normal.includes(marker) ? folder : undefined
}

/** Why `wildshard` running from the home folder's install is likely a mistake, or undefined. */
export function homeInstallWarning(install: Install): string | undefined {
  const home = path.normalize(install.home)
  const cwd = path.normalize(install.cwd)
  if (installingFolder(install.sdk) !== home || cwd === home) {
    return undefined
  }
  if (!cwd.startsWith(`${home}${path.sep}`)) {
    return undefined
  }
  return (
    'wildshard: this sdk is installed in your home folder, not in this one ' +
    '(npm installs into the nearest folder above that has a package.json). ' +
    'Run `npm init -y` here, then install @wildshard/sdk again (GUIDE.md, ' +
    '"Running wildshard today").\n'
  )
}
