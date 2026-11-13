# Build encodes audio (AU7)

- Lane opus-au7, meta AUDIO-PLAN AU7 (J299). `src/sharddev/audioEncode.ts`:
  the build re-encodes each source recording among a shard's mounts to
  AU5's targets before the cook input is written. aac_at on macOS, ffmpeg
  `aac` elsewhere. Sound effects go mono unless `audio-stereo.json`
  (`{version:1, stereo:[url]}`) marks them stereo.
- Surprises: AudioToolbox's CBR raises stereo under 64 kbps to 64, so a
  stereo sound effect (48 kbps cap) takes ffmpeg `aac`. A clip of a few
  frames overshoots its rate (crab_snap, 0.15 s, 44 kbps at 40), so the
  encoder steps down 8 kbps, twice at most.
- URLs stay as they are (a `.wav` mount serves AAC bytes): rows, the fence
  list and shard code name them. AU5's count covers only `.m4a`/`.wav`
  URLs, so a `.flac` or `.aiff` mount is not in the budget yet.
- No ffmpeg on PATH: the sources ship as they are and the line says so.
- Driftwood: 2.49 MB -> 1.70 MB, AU5 green; a second build takes all 20
  from the cache with identical bytes.
