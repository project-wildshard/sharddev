# A shard builds to the same bytes on x86-64 and arm64 (opus-x86, meta QA 11-23-b row 14)

- Brasscap built to product `378d0e0e` on x86 Ubuntu and `c08447e1` on the Mac and on linux/arm64 Docker, so every
  publish from an x86 runner re-recorded the hero look and stopped on "the build changed tracked files: src/hero.json".
- Docker builds on linux/amd64 (QEMU) and linux/arm64, diffed file by file: one props tile GLB (tile 4,3) differs, and
  only in 24 normals' y: 0 on x86, 1.4e-18 on arm64. The props and tiles sections differ only by naming it.
- Cause: V8's Math.sin, cos, tan, asin, acos, atan, atan2, sinh, cosh, tanh, asinh, acosh, atanh, exp, expm1, log,
  log1p, log2 and log10 are compiled fdlibm C. Clang fuses a*b+c into one FMA on arm64 and cannot on x86-64, so the
  same call returns a different last bit. Node 24.22.3 on both arches: 19 of 23 Math functions hash differently over
  a fixed input set; sqrt, cbrt, pow and hypot agree. sharp, zlib-ng, libwebp and meshopt gave identical bytes.
- Fix: `@wildshard/sdk/deterministicMath`, V8 13.6's fdlibm ported line for line to JavaScript (JS arithmetic is one
  IEEE rounding per operation on every CPU). It equals x86-64 V8's Math bit for bit (0 misses over ~280k inputs per
  function), so x86 products do not change; Mac products change once. The build installs it on the global Math first
  thing (build's `sameMath.ts`, `buildProject`, `createProjectGeneration`), so author code and three.js use it too.
  Generation cache keys carry `math`, so a step cached under native Math misses once.
- Proof: Brasscap with the fix is `378d0e0e` on linux/amd64 and linux/arm64, 223 of 223 files the same.
- Check: `.github/workflows/arch-parity.yml` runs `packages/sdk/scripts/arch-parity.mjs` on ubuntu-24.04 and
  ubuntu-24.04-arm and fails on any difference. `deterministicMath.test.ts` pins the outputs and, on x64, Math.
- Second cause (opus-compat-w13): a worktree's untracked `public/` assets reach its build, so the look it recorded
  was not CI's. The cut no longer records a look while `src/` or `public/` holds untracked files; it says which.
