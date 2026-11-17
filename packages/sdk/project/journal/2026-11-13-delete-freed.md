# delete-placed goes, delete prints the freed cell

> Written by: Claude (opus-whoami2), 2026-11-13

api-server SA31 (`2b1c39a`, v0.11.0, live as v0.12.0) stopped refusing a delete of a grid-placed slug: finalize drops
its grid cells and frees its own cell for the next new slug, answering `cells` and `freed`. DEL10's `delete-placed`
rule matched the old 409 only, so it went with its GUIDE heading and test. `wildshard delete` now prints
`grid cell freed: [col, row]` (or `none`) after the cells line; the delete double places a slug and frees it instead of
refusing. A 409 left over from an older API falls to `delete-refused`, which prints the API's words.
