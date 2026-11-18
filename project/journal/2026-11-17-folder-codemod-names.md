# Folder codemod: the headless session and native plan names (opus-sdksplit7, SDK-SPLIT SP13g)

- Sky Reach's CI failed on engine 0.1.35's renames the 0.4.0-folder codemod missed: `beginProductSession`,
  `openProductSession` (test/headless/folderSession) and `prepareProductPlan` (test/headless-native). Driftwood and
  Nalati use them too; the codemod now renames them.
