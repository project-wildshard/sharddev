#!/usr/bin/env bash
# Deploy the drafts site (WORLDCLAW-TOOLS W16, J16, J26; meta DRAFTS-PLAN DR4): by hand, at a stage boundary, never
# from a push. Builds from a clean export of HEAD (nobody's half-finished files ship), then deploys it to the Cloudflare
# Worker `wildshard-drafts` (drafts/wrangler.jsonc: static assets plus drafts/worker.ts) at https://drafts.wildshard.io.
#
#   pnpm drafts:deploy          # commit first: it ships HEAD, not the working tree
#
# The pictures are not in the deploy: they are in R2 `wildshard-records` under drafts/ (atlas.ts --publish, DRAFTS
# DR3), and the Worker serves them at /media/. wrangler's own login is the credential (`wrangler whoami` shows account
# 0a870ffdd1b0bca67f7fedad77f67957); no key is kept in the repo.
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
cd "$repo"
sha="$(git rev-parse --short HEAD)"
dirty="$(git status --porcelain -- drafts | grep -v '^??' || true)"
if [ -n "$dirty" ]; then
  echo "deploy-drafts: drafts/ has uncommitted edits; HEAD ($sha) ships without them:" >&2
  echo "$dirty" >&2
fi
command -v wrangler >/dev/null || { echo "deploy-drafts: needs wrangler on PATH (pnpm add -g wrangler)" >&2; exit 1; }

# The clean export goes under the repo's gitignored tmp/, never /tmp or $TMPDIR (meta AGENTS.md "Disk", DRAFTS DR2).
work="$repo/tmp/drafts-deploy"
rm -rf "$work"
mkdir -p "$work"
trap 'rm -rf "$work"' EXIT
git archive HEAD drafts scripts/vite-tmp.mjs tsconfig.json package.json | tar -x -C "$work"
ln -s "$repo/node_modules" "$work/node_modules"

# The build lands in $work/tmp/dist-drafts, where drafts/wrangler.jsonc's assets.directory points.
echo "deploy-drafts: building $sha"
(cd "$work" && DRAFTS_BUILD_SHA="$sha" "$repo/node_modules/.bin/vite" build --config drafts/vite.config.ts --logLevel warn)

echo "deploy-drafts: deploying the Worker wildshard-drafts"
(cd "$work/drafts" && wrangler deploy --config wrangler.jsonc)

live="${DRAFTS_LIVE:-https://drafts.wildshard.io}"
# Retry, uncached: the edge can serve the preceding version for a moment after the upload.
build=""
for _ in {1..12}; do
  build="$(curl -fsS -H 'Cache-Control: no-cache' "$live/version.json?t=$(date +%s)" | sed -E 's/.*"build":"([^"]+)".*/\1/' || true)"
  case "$build" in "$sha"*) echo "deploy-drafts: live at $live (build $build)"; exit 0 ;; esac
  sleep 5
done
echo "deploy-drafts: $live reports build $build, not $sha" >&2
exit 1
