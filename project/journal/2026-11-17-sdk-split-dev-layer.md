# The author lint accepts @wildshard/dev (SDK-SPLIT SP13g)

- opus-sdksplit6: Sky Reach's map bake moved to `@wildshard/dev/bake/mapRest` (the 0.4.1 split codemod), and the
  author lint refused it: "No such layer package". The layer rule accepts a real export of kit, upload and build;
  dev joins them. An unknown dev subpath still refuses (`layer-dev.test.ts`, red without the fix).
