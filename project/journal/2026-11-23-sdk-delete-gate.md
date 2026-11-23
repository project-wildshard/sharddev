# The SDK delete gate (SHARD-COMPAT ST19a)

scripts/sdk-exports.mjs locks every public SDK export, bin and CLI verb and censuses which
shard repos use each one; pnpm check refuses deleting a name a repo still uses. The 11-17 SDK
split cost 53 hand commits in 11 repos; a rename now keeps its alias until the census is zero.
- ST19b: `node scripts/sdk-exports.mjs alias ./old ./new` keeps a renamed export as a shim that warns once
  and re-exports the new module; deleting it in the release that made it refuses.
