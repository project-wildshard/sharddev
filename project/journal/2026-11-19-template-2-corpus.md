# 2026-11-19: off Template 2's corpus

> Written by: Claude

shard-format deletes `corpus/handwritten` (meta TEMPLATE-E2E TR-10, J434),
so sharddev stops reading it before its next format bump. The test
shardfile helper and its hero fixture start from Brasscap Mesa's export
(`corpus/exports/brasscap-mesa`, folder `brasscap-mesa`); the retired
`--template blender` shape that tests still build starts from the same
export; the hero digest test's handwritten packed-card case folds into
Brasscap's, which carries a packed manifest card itself.
