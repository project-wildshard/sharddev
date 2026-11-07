#!/usr/bin/env bash
# Deploy the drafts site (WORLDCLAW-TOOLS W16, J16, J26): by hand, at a step boundary, never from a push.
# Builds from a clean export of HEAD (AGENTS.md: nobody's half-finished files ship), then uploads the static output to
# the Vercel project `wildshard-drafts` (J55). Its Git auto-deploy is off: the project has no Git link at all.
#
#   bash drafts/tools/deploy.sh          # commit first: it ships HEAD, not the working tree
#
# The pictures are not in the deploy: they are on Blob already (drafts/tools/atlas.ts --publish, J28).
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
cd "$repo"
sha="$(git rev-parse --short HEAD)"
dirty="$(git status --porcelain -- drafts | grep -v '^??' || true)"
if [ -n "$dirty" ]; then
  echo "deploy-drafts: drafts/ has uncommitted edits; HEAD ($sha) ships without them:" >&2
  echo "$dirty" >&2
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/wildshard-drafts-deploy.XXXXXX")"
trap 'rm -rf "$work"' EXIT
git archive HEAD drafts tsconfig.json package.json | tar -x -C "$work"
ln -s "$repo/node_modules" "$work/node_modules"

echo "deploy-drafts: building $sha"
(cd "$work" && DRAFTS_BUILD_SHA="$sha" "$repo/node_modules/.bin/vite" build --config drafts/vite.config.ts --logLevel warn)

# Link the output folder to the project (ids are not secrets; the CLI's own login is the credential).
mkdir -p "$work/dist-drafts/.vercel"
cp drafts/vercel-project.json "$work/dist-drafts/.vercel/project.json"

echo "deploy-drafts: uploading"
url="$(vercel deploy "$work/dist-drafts" --prod --yes --scope raynos-projects 2>/dev/null | grep -Eo "https://[^ ]+vercel.app" | tail -1)"
echo "deploy-drafts: $url"

live="https://wildshard-drafts.vercel.app"
build="$(curl -fsS "$live/version.json" | sed -E 's/.*"build":"([^"]+)".*/\1/')"
case "$build" in
  "$sha"*) echo "deploy-drafts: live at $live (build $build)" ;;
  *) echo "deploy-drafts: $live reports build $build, not $sha" >&2; exit 1 ;;
esac
