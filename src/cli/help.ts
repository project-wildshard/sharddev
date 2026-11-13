import { DEFAULT_BROTLI_LEVEL } from './upload/compress.ts'

// SHARD-AUTHORING SA2 (J317): every verb's help in the glossary's words (meta
// docs/architecture/README.md § Glossary): shard source, shard file, build
// (which bakes), check, hero, prepare, upload, channel, flip. Never product,
// publish (for an upload), promote, cook, head or tarball; `pack` only as the
// deprecated alias below. Flag names stay as they are, retired word or not:
// renaming one breaks scripts. help.test.ts greps every verb's help for the
// retired words. bin/wildshard.mjs prints `wildshard <verb> --help` from here.

const LEVEL = String(DEFAULT_BROTLI_LEVEL)

/** The deprecated alias's whole entry: the one place help may say pack. */
const PACK_ALIAS = `pack <folder> [--out <file>]
                       Deprecated alias: wildshard build <folder> [file]`

/** Each verb's entry: its usage lines, then what it does, indented. */
const VERBS: Readonly<Record<string, string>> = {
  new: `new <dir> [slug] [--template sdk|blender] [--empty]
                       Start a shard repo in <dir>, a folder that does not
                       exist yet, with its shard source at src/ (slug: the
                       folder's name unless given). --template sdk (the
                       default) copies the reference world; --template
                       blender copies the hand-written Blender template
                       (a shard file folder, no code). --empty writes a
                       bare shard source instead`,
  update: `update [dir] [--pins[=<version>]]
                       Rewrite GUIDE.md and the four wildshard skills in
                       .claude/skills/ from the installed sdk (dir: the
                       shard repo, default the current folder). Adds the
                       .agents/skills links, AGENTS.md and CLAUDE.md if
                       missing; touches nothing else, and leaves an
                       AGENTS.md you changed (it says so). --pins first
                       moves the repo to a newer sdk (npm's latest, or
                       --pins=<version>): moves the pins, runs pnpm
                       install, applies the release's codemods, then
                       runs the new sdk's update and check`,
  dev: `dev <source> [port]
                       Serve the shard source on localhost (port 0, the
                       default, picks a free one) and build it again on
                       every edit`,
  check: `check <source> [folder] [--json]
                       Lint, build, validate, prove (with the shard
                       source's proof.json) and read the report card, then
                       give one verdict. --json prints only the verdict
                       document: { version, verdict, project, output, ms,
                       steps: [{ name, status, ms, note? }], refusals:
                       [{ step, rule, message, fix, guide, file? }],
                       warnings: [the same] }. Every refusal names its
                       rule, a fix and its GUIDE.md section. A warning (an
                       unprepared draft) does not fail the verdict. Exits 1
                       on fail`,
  hero: `hero <source> --base <served-build-url>
                       Capture the shard's hero (thumb, portrait,
                       landscape) in headless Chromium from a served build
                       of this candidate (the URL \`wildshard dev .\` prints),
                       and stamp hero.json with its content
  hero <source> --stamp-existing
                       No capture: stamp the hero images already in the
                       shard source as current. WARNING: use it ONLY when
                       those images show the current content; a wrong
                       stamp hides a stale hero from the cut`,
  upload: `upload <file> --channel staging|prod [--server <url>]
         [--level <n>] [--version <X.Y.Z>] [--commit <sha>] [--no-place]
                       Check a shard file (an unprepared draft, sdk 0.2,
                       is refused before anything is sent), compress it
                       (Brotli level <n>, default ${LEVEL}), sign it with the
                       creator key and upload it to the API. The channel
                       is required: staging flips the preview and staging
                       pointers, prod flips all three (production too).
                       Sends the shard source version (default: the shard
                       source's package.json version), the shard source
                       commit (default: the checked-out commit of a clean
                       tree) and the sdk, engine and shard-format releases
                       it was built with. Refuses a hero unchanged since
                       the shard's newest upload (run hero first). Prints
                       the API's version, format version and migrations,
                       then the grid: the shard's cell ("placed at (0,3)
                       on preview, staging"), "grid full, not placed",
                       "not placed (--no-place)", or "no new cell" while
                       the API's placement is off or past the shard's
                       first upload; then the /slug/<slug> link on each
                       channel the upload moved (that page is not built
                       yet). --no-place takes no grid cell, for a proof
                       upload. Only a shard's first upload takes a cell,
                       so one uploaded with --no-place never gets one; on
                       a later upload --no-place leaves the grid as it
                       was, so a prod upload adds no production cell.
                       Sends your account key (WILDSHARD_API_KEY, else
                       the file wildshard account saved; with neither it
                       refuses before anything is sent). Reads
                       WILDSHARD_API_URL when --server is absent,
                       WILDSHARD_CREATOR_PRIVATE_KEY, and
                       VERCEL_AUTOMATION_BYPASS_SECRET for a protected
                       preview`,
  account: `account <email> [--server <url>] [--force]
                       Make your Wildshard account (no mail is sent) and
                       save its key to ~/.config/wildshard/sharddev-key
                       (mode 600) for upload to send. The API shows a key
                       once: an email that has an account is refused, and
                       a lost key needs an operator reset. A saved key is
                       never replaced without --force. Reads
                       WILDSHARD_API_URL when --server is absent`,
  whoami: `whoami [--server <url>]
                       Print where upload's account key comes from
                       (WILDSHARD_API_KEY, else the key file) and its
                       first characters, never the whole key, then the
                       key's account: its email and how many slugs it
                       owns. Reads WILDSHARD_API_URL when --server is
                       absent`,
  delete: `delete <slug> [--yes] [--server <url>]
                       Delete your shard: it leaves the catalogue, every
                       channel and the grid at once. Prints what it would
                       delete (its versions, the channels pointing at it,
                       and whether a signed release still plays it until
                       its next release), then asks you to type the slug;
                       anything else deletes nothing. The confirmation
                       lasts 10 minutes. --yes skips typing, for scripts.
                       Sends your account key, as upload does; only the
                       key that uploaded the shard deletes it. Reads
                       WILDSHARD_API_URL when --server is absent`,
  build: `build <source> [folder] [--shardfile-only | --folder-only]
        [--no-placeholders] [--output=<slug>]
                       Build the shard source: bake it into a shard file
                       folder (default <source>/public/shardfiles/<slug>),
                       then write the shard file <slug>.shardfile beside
                       it and run shard-format's checks on it. Refuses a
                       shard whose captured hero is older than its content
                       (hero.json) and prints the audio rules. What it
                       writes is a draft (sdk 0.2): it warns that the API
                       and upload refuse a draft until prepare makes it
                       sdk 0.3. --shardfile-only skips the web client;
                       --folder-only also skips the shard file
  build <folder> [file]
                       Write the shard file of a built shard file folder
                       (default <slug>.shardfile beside it), with the same
                       checks
  build <source> --behaviour-only [--check]
                       Build only the shard source's native behaviour
                       outputs; --check refuses stale ones and writes
                       nothing`,
  prepare: `prepare <folder> --base <exact-preview-url>
                       Record the shard file folder in phone WebKit against
                       an exact engine preview and write its author
                       preparation (the fence, the fence policy and the
                       recorded programs): the draft becomes sdk 0.3, the
                       only kind upload sends. Then write its shard file
                       with build <folder>`,
  validate: `validate <source | folder | shard.json>
                       Validate a shard source, or a built shard file
                       folder with shard-format's checks, and run it
                       headlessly against its budgets`,
  prove: `prove <source | folder | shard.json> <proof.json>
                       Play the proof tape headlessly and print what
                       happened as JSON`,
  synth: `synth <source>
                       Run shard.config.ts's scene and identity exports in
                       Node and write the scene they describe as data`,
  schema: `schema [list|shardfile|<root>] [JSON-pointer]
                       Print the JSON Schema of shard.json (\`shardfile\`) or
                       of one section (<root>), or of the part at a JSON
                       pointer; list names every root`,
  serve: `serve [--port <n>]   Start the sharddev server on localhost`,
  'build-shards': `build-shards [--shard=<slug>[,<slug>]] [--reuse]
                       Build every shard source under src/shards into its
                       shard file folders (one per output) under out/.
                       --shard builds only those outputs; --reuse keeps a
                       folder whose inputs are unchanged`,
  pack: PACK_ALIAS,
}

/** Indent every line of a verb's entry for the full help. */
function indented(entry: string): string {
  return entry
    .split('\n')
    .map((line: string): string => (line.startsWith(' ') ? line : `  ${line}`))
    .join('\n')
}

const USAGE = `Usage: wildshard <command> [options]

The loop: new, dev, check, hero, upload. A shard source builds a shard file;
upload sends it to the API for a channel.

Commands:
${Object.values(VERBS)
  .map((entry: string): string => indented(entry))
  .join('\n')}

Options:
  --version            Print the sdk, engine, shard-format and three
                       versions (after upload: the shard source version)
  --help               Print this help (after a command: that command's)

Also installed as \`sharddev\`. wildshard help <command> prints one command.
`

/** The verbs help knows, in the order the full help lists them. */
const HELP_VERBS: readonly string[] = Object.keys(VERBS)

/** One verb's help, or undefined for a verb help does not know. */
function verbHelp(verb: string): string | undefined {
  const entry = Object.hasOwn(VERBS, verb) ? VERBS[verb] : undefined
  return entry === undefined ? undefined : `Usage: wildshard ${entry}\n`
}

export { HELP_VERBS, PACK_ALIAS, USAGE, verbHelp }
