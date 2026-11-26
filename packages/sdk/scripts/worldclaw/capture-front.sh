#!/usr/bin/env bash
# T6's helper (E406): World Explorer views of a shard through the harness params
# (`explore=world`, `cam`), one PNG per camera, into the round's art folder. Pair it with spec-map.py for the plan
# map (a vertical shard's overhead view shows roofs, not floors).
#
#   scripts/browser-lane.sh wait
#   bash scripts/worldclaw/capture-front.sh <slug> <build url> <out dir> <cams.json>
#
# cams.json: [{ "name": "view-a-spawn", "w": 402, "h": 874, "cam": "x,y,z,yaw,pitch" }, …] — metres, the engine's yaw and
# pitch in radians (yaw = −heading°; a shard's mockupCameras.ts says how its own cameras map). 402 × 874 is the phone's
# portrait frame (Jake's iPhone, AGENTS.md); a map view may be square. Serve a build first (scripts/serve-build.sh); the
# browser is muted and closed at the end (AGENTS.md: the browser lane).
set -euo pipefail
slug="$1"; url="$2"; out="$3"; cams="$4"
# CHUNK-PARAM-REMOVAL CP19 (J522): no address names the zone. Each view writes the Zone Select tap into the tab first
# (engine's zone-entry --init, the bytes the title writes; its engine .ts loads through the format hook, J82), then opens /.
here="$(cd "$(dirname "$0")" && pwd)"
# The engine is packages/dev's dependency (the sdk has none), so the tap is printed from there.
tap=$(cd "$here/../../../dev" && node --import @wildshard/engine/scripts/format-hook.mjs \
  "$(node -p "require.resolve('@wildshard/engine/scripts/zone-entry.mjs')")" --init "$slug" --mode explore)
mkdir -p "$out"
session="front-$slug"
# a shard boots and streams its world before the first frame is final (~60–120 s headless, AGENTS.md ▸ Mockups)
settle="${SETTLE_S:-75}"
n=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).length)" "$cams")
for ((i = 0; i < n; i++)); do
  read -r name w h cam < <(node -e "const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))[+process.argv[2]];console.log(c.name,c.w,c.h,c.cam)" "$cams" "$i")
  agent-browser --session "$session" set viewport "$w" "$h" >/dev/null
  agent-browser --session "$session" open "${url%/}/version.json" >/dev/null
  agent-browser --session "$session" eval "$tap" >/dev/null
  agent-browser --session "$session" open "${url%/}/?explore=world&cam=${cam}&mute=1&skipintro" >/dev/null
  sleep "$settle"
  agent-browser --session "$session" screenshot "$out/$name.png" >/dev/null
  echo "capture-front: $out/$name.png"
done
agent-browser --session "$session" close >/dev/null
