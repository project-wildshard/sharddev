# sharddev: PRD

Status: draft 2026-11-05: drafted by Claude from `Raynos/project-wildshard-meta` plans, for Jake to correct.

Living doc: **what** this repo does and **why**. How it is built is
`docs/design.md`; decisions are `docs/decisions.md`; the first plan is
in `docs/plans/`. Requirement ids (`R-1`) are stable: cite them from
plans, commits and tests.

## In Jake's words (REPOS.md)

> The local dev server, including model explore, set explore, world explore, arena etc.
> The draft tool.
> The cli for baking and building a shardfile output from a shardsource source code directory.
>
> Depends on engine, shardfile.

## One line

The author's toolbox: the `wildshard` CLI that bakes shard source into a shardfile, the author SDK, the local dev server (engine client against engine server), the explorers, arena and drafts tool.

## Requirements

- **R-1**: The `wildshard` CLI: `new`, `synth`, `build`, `dev`, `prove`
- **R-2**: The bake pipeline, including the AssemblyScript to Wasm compiler
- **R-3**: The author SDK that shard generators import (J21)
- **R-4**: Model, set and world explorers, the arena
- **R-5**: The drafts tool and its deploy: the Cloudflare Worker `wildshard-drafts` at https://drafts.wildshard.io,
  pictures in R2 `wildshard-records` under `drafts/` (meta DRAFTS-PLAN; Vercel project and Blob store deleted 11-11)

## Not this repo

- Format validation (shardfile)
- Cooking runtime packs (engine)
- Storing shards (api-server)

## Who uses it

- every shard-* repo (to build)
