# Install-script allowlist (SA39, J319)

- `wildshard new` (reference and `--empty`) writes `pnpm-workspace.yaml`
  with `allowBuilds: {}`: generators may install any npm package (J319),
  so only a listed dependency may run an install script. A test pins it.
- Empty on purpose: nothing `@wildshard/sdk` installs has an install
  script (lockfile scan; a fresh install of the packed sdk reported none).
- pnpm 10.34.9 reads `allowBuilds` (`esbuild: true` built esbuild);
  pnpm 10.21 ignores it and runs nothing. The pnpm pin itself waits for
  the `package.json` SA16 writes.
- Proof: a new project with the packed sdk plus a fake postinstall
  package installed and built; the postinstall never ran and
  `pnpm ignored-builds` named it.
