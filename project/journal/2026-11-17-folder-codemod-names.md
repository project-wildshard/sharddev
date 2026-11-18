# Folder codemod: the headless session and native plan names (opus-sdksplit7, SDK-SPLIT SP13g)

- Sky Reach's CI failed on engine 0.1.35's renames the 0.4.0-folder codemod missed: `beginProductSession`,
  `openProductSession` (test/headless/folderSession) and `prepareProductPlan` (test/headless-native). Driftwood and
  Nalati use them too; the codemod now renames them.
- opus-sdksplit8: the import pattern's `[^}]*` let a match start at an earlier block `{`, so a destructured
  `await import()` inside a function (Driftwood's `driftwood-trade-native.ts`) kept `prepareProductPlan`; it is
  `[^{}]*` now. Engine's `test/headless/admittedProductCache` (`admittedProduct`, `createAdmittedProductCache`,
  `ProductMode`) moves to `admittedFolderCache` too (Driftwood and Nalati `productSession.ts`).
