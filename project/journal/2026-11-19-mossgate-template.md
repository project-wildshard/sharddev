# Mossgate stays a template

> Written by: Claude (opus-mossgate-m5), 2026-11-19

MOSSGATE-ZONE MZ25. world.ts was 994 lines, past what a new author reads in one go. It splits along the cleanroom's
own sections: `hollow.ts` (the yard's LAYOUT, the ground's height and colour, the pond's shape; it imports no scene
file), `kit.ts` (shared materials and builders), `yard.ts`, `garden.ts`, `ring.ts`, and `world.ts` keeps only the
build order. No barrel: every file imports LAYOUT and groundHeight from `hollow.ts` (E434). A test holds every
generator file under 400 lines. GUIDE 2b gains a table of the files, a file per region and one per mechanic, and
the README `new` writes names them.
