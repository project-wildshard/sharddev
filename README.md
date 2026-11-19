# sharddev

The author's toolbox: the `wildshard` CLI that builds a shard source into a shard file and uploads it, the author SDK,
the local dev server, the explorers, arena and drafts tool. It publishes six packages at one version (meta SDK-SPLIT):

| Package | Folder | What it is |
|---|---|---|
| `@wildshard/cli` | `packages/cli` | The `wildshard` command; one install brings build, upload and dev |
| `@wildshard/sdk` | `packages/sdk` | The author library: scene source, rows, random, noise, bake builders, script compile, schemas |
| `@wildshard/kit` | `packages/kit` | Shared creature content and author geometry |
| `@wildshard/build` | `packages/build` | Read a shard source, run its generators, write and validate the shard file; never loads the engine |
| `@wildshard/upload` | `packages/upload` | `upload`, `account`, `delete` and the shard file writer; engine-free |
| `@wildshard/dev` | `packages/dev` | The local game and every other verb (dev, watch, check, prove, hero, serve); the only package with the engine |

## Read first

- [docs/prd.md](docs/prd.md): what this repo does. [docs/design.md](docs/design.md): how it is built.
  [docs/dev.md](docs/dev.md): commands, layout and code rules.
- [AGENTS.md](AGENTS.md): working rules for agents in this repo.

## Guides for authors

- **Audio:** [shard-format `docs/audio.md`](https://github.com/project-wildshard/shard-format/blob/main/docs/audio.md):
  what music and sound effects to ship (format, bitrate, length, loudness, loops, sharing, the 6 MB and 10 MB budget),
  and which check `wildshard build` and `wildshard upload` run on them.
