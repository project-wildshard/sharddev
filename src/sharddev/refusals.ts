// SHARD-AUTHORING SA21 (J317, "the first ten minutes"): every refusal an author can hit in `wildshard` (lint, build,
// validate, prove, the report card, new, the shard file build writes (and `pack`, its deprecated alias, SA3) and upload's
// local checks) names a stable rule id, a one-line fix and a
// GUIDE.md section. This file is the one table. GUIDE.md (SA13) writes one heading per anchor below, so
// `GUIDE.md#<anchor>` lands on it; refusals.test.ts fails a row with no fix or anchor and a wildshard lint rule with no
// row. Rule ids are stable: rename one only together with its GUIDE.md heading.
//
// SA41: shard-format's refusals carry a stable code (its `issue-codes.ts`, docs/VALIDATION-CODES.md): a validator's
// `error.code`, `PerformanceIssue.code`, `AudioFinding.code`. A coded refusal takes the row that lists its code, from any
// step; every one of shard-format's codes has a row (refusals.test.ts fails a new code with none). Words are the fallback
// for refusals with no code (sharddev's own, and shard-format's admitted-with-warning lines): a message takes the first
// row (in table order) for its step whose pattern matches, else its step's catch-all (the row with neither pattern nor
// codes), wherever that sits.
//
// Messages stay as the refusing code (and shard-format) words them: a row matches them, it never rewrites them.
import type { IssueCode } from '@wildshard/format/issue-codes';

/** Where a refusal came from: `check`'s five steps, then the other verbs. `shardfile` is the shard file build writes (SA3). */
export type RefusalStep = 'lint' | 'build' | 'validate' | 'prove' | 'report' | 'new' | 'update' | 'shardfile' | 'pack' | 'upload' | 'account' | 'delete';
/** One rule: its id, its GUIDE.md anchor, the fix, the shard-format codes it names (from any step) and the refusal
 *  messages it names in `steps` (neither: the step's catch-all). */
export interface RefusalRule {
  readonly id: string;
  readonly anchor: string;
  readonly fix: string;
  readonly steps: readonly RefusalStep[] | 'any';
  readonly codes?: readonly IssueCode[];
  readonly match?: RegExp;
}
/** What a refusal carries besides its words: oxlint's code and help, or shard-format's issue code. */
export interface RefusalSource { readonly lint?: { readonly code: string | null; readonly help: string | null } | undefined; readonly code?: string | undefined }
/** What a printed refusal carries besides its message. `guide` is `GUIDE.md#<anchor>`. */
export interface RefusalNote { readonly rule: string; readonly fix: string; readonly guide: string }

/** The author's manual: shipped in the package and written into a project by `wildshard new` (SA13). */
export const GUIDE_FILE = 'GUIDE.md';

/** The refusals that are not lint rules, most specific first; each step has one catch-all (no `match`). */
export const REFUSAL_RULES: readonly RefusalRule[] = [
  { id: 'usage', anchor: 'usage', steps: 'any', match: /^usage: |^unknown (?:wildshard command|build flag|command)|unknown or incomplete build map flag|^Unknown schema root|accepts no pointer|^dev port must be|^invalid --port\b|^(?:validate|prove) requires a format-2 shard\.json or (?:shard source|author project)/u,
    fix: 'Run `wildshard --help` and give the verb the arguments and flags it lists.' },
  // new
  { id: 'new-target', anchor: 'new-target', steps: ['new'], match: /new requires a fresh directory and kebab-case slug/u,
    fix: 'Name a folder that does not exist yet and a kebab-case slug: `wildshard new my-isle`.' },
  { id: 'new-template', anchor: 'new-template', steps: ['new'], match: /^new: unknown template /u,
    fix: 'Leave out --template, or pass `--template sdk` (the reference world) or `--template blender` (the hand-written Blender template).' },
  { id: 'new-refused', anchor: 'new-refused', steps: ['new'],
    fix: 'Reinstall @wildshard/sdk (`pnpm install`); `new` copies the reference world shipped with it.' },
  // update (SA28)
  { id: 'update-target', anchor: 'update-target', steps: ['update'], match: /^update: .* is not a shard repo/u,
    fix: 'Run `wildshard update` in the repo `wildshard new` made, or name it: `wildshard update my-isle`.' },
  { id: 'update-pins-no-git', anchor: 'update-pins-no-git', steps: ['update'], match: /^update --pins: .* is not in a git repo with its package\.json committed/u,
    fix: 'Put the shard repo in git and commit it (`git init`, `git add .`, `git commit`), then run `wildshard update --pins` again.' },
  { id: 'update-pins-dirty', anchor: 'update-pins-dirty', steps: ['update'], match: /^update --pins: .* has uncommitted changes/u,
    fix: 'Commit or stash your changes, then run `wildshard update --pins` again.' },
  { id: 'update-pins', anchor: 'update-pins', steps: ['update'], match: /^update --pins: /u,
    fix: 'Read the line above and the GUIDE.md heading for its case, fix that, then run `wildshard update --pins` again.' },
  { id: 'update-refused', anchor: 'update-refused', steps: ['update'],
    fix: 'Reinstall @wildshard/sdk (`pnpm install`); `update` copies GUIDE.md and the skills shipped with it.' },
  // build
  { id: 'source-file-missing', anchor: 'source-file-missing', steps: ['build', 'validate', 'prove'], match: /ENOENT: no such file or directory|Cannot resolve entry module/u,
    fix: 'Check the path shown: the shard source or shard file folder, or a file it names, is not there.' },
  { id: 'source-import-missing', anchor: 'source-import-missing', steps: ['build'], match: /Could not resolve|Cannot find (?:module|package)|Failed to resolve import/u,
    fix: 'Fix the import path, or add the package to package.json and run `pnpm install`.' },
  { id: 'json-syntax', anchor: 'json-syntax', steps: ['build'], match: /builtin:vite-json|while parsing|is not valid JSON|in JSON at position/u,
    fix: 'Fix the JSON at the line and column shown: usually a missing comma, bracket or quote.' },
  { id: 'source-syntax', anchor: 'source-syntax', steps: ['build'], match: /builtin:vite-transform|SyntaxError|Unexpected token|Expected .* but found/u,
    fix: 'Fix the syntax error at the file and line shown; your editor\'s TypeScript check marks it too.' },
  { id: 'config-default-export', anchor: 'config-default-export', steps: ['build'], match: /config has no default export|config generate export must be a build function|Author module has no exports/u,
    fix: 'shard.config.ts must `export default generate;`, the function `wildshard new` wrote there.' },
  { id: 'config-file-access', anchor: 'config-file-access', steps: ['build'], match: /must use injected build capabilities for file access/u,
    fix: 'Read files through the build context (`ctx.cached`), not node:fs, in code shard.config.ts imports.' },
  { id: 'project-folder-slug', anchor: 'project-folder-slug', steps: ['build'], match: /Manifest identity differs from its folder/u,
    fix: 'Name the shard source folder after the shard\'s slug (data/identity.json), or change the slug to the folder\'s name.' },
  { id: 'source-schema', anchor: 'source-schema', steps: ['build'], match: /(?:^|: |; )Invalid [a-z]+: /u,
    fix: 'Give the field at the path shown the value it expects; `wildshard schema shardfile <pointer>` prints its shape.' },
  { id: 'build-refused', anchor: 'build-refused', steps: ['build'],
    fix: 'Fix what the message names (a file, field or generator) and run `wildshard check` again.' },
  // validate
  { id: 'validate-refused', anchor: 'validate-refused', steps: ['validate'],
    fix: 'Rebuild with `wildshard check`; if a fresh build of unedited output still fails, report it with this message.' },
  // prove
  { id: 'proof-tape-invalid', anchor: 'proof-tape-invalid', steps: ['prove'], match: /^[^\s/]+\.json: /u,
    fix: 'Fix the proof tape (proof.json) where the message says; its shape is the author proof plan.' },
  { id: 'proof-failed', anchor: 'proof-failed', steps: ['prove'],
    fix: 'Walk the quest in `wildshard dev`, then fix the data or the tape step that did not happen.' },
  // the report card (budgets, J303): shard-format's PerformanceIssue codes
  { id: 'budget-unmeasured', anchor: 'budget-unmeasured', steps: 'any',
    codes: ['perf-native-view-unmeasured', 'perf-native-resident-unmeasured', 'perf-script-sample-invalid', 'perf-script-samples-missing'],
    fix: 'Run the shard long enough to measure: `wildshard check` measures it headlessly; native gameplay needs a browser proof.' },
  { id: 'budget-download', anchor: 'budget-download', steps: 'any',
    codes: ['perf-library-download-budget', 'perf-critical-download-budget', 'perf-library-download', 'perf-critical-download', 'perf-tile-download', 'perf-far-download'],
    fix: 'Shrink or drop assets on the named download tier, or move them to a later tier.' },
  { id: 'budget-draws', anchor: 'budget-draws', steps: 'any', codes: ['perf-tile-draws', 'perf-far-draws'],
    fix: 'Merge meshes that share a material, or cut objects from the named view.' },
  { id: 'budget-triangles', anchor: 'budget-triangles', steps: 'any', codes: ['perf-tile-triangles', 'perf-far-triangles'],
    fix: 'Lower the mesh detail (LODs, fewer props) in the named view.' },
  { id: 'budget-memory', anchor: 'budget-memory', steps: 'any', codes: ['perf-memory-target', 'perf-playing-memory', 'perf-loading-memory'],
    fix: 'Cut texture size or count and mesh bytes until the named total fits.' },
  { id: 'budget-script-cpu', anchor: 'budget-script-cpu', steps: 'any', codes: ['perf-script-cpu'],
    fix: 'Do less work per tick in behaviour scripts: spread it over ticks or run it on events.' },
  { id: 'budget-script-fuel', anchor: 'budget-script-fuel', steps: 'any', codes: ['perf-script-fuel'],
    fix: 'Shorten the hottest behaviour script loops; fuel counts instructions per tick.' },
  { id: 'budget-over', anchor: 'budget-over', steps: ['report'],
    fix: 'Run `wildshard check`: its report step names each budget over its limit and the row here for each.' },
  // `Performance report refused` is sharddev's own words (cli.ts); the two codes are shard-format's preflight of the same.
  { id: 'budget-refused', anchor: 'budget-refused', steps: ['build', 'validate'], codes: ['declared-costs', 'performance-targets'], match: /Performance report refused/u,
    fix: 'Run `wildshard check`: its report step names each budget over its limit and the row here for each.' },
  // the shard file build writes (SA3; `pack` is its deprecated alias) and upload, before a byte is sent. `shardfile-draft` is
  // a warning from build and check and a refusal from upload (draft.ts).
  { id: 'hero-stale', anchor: 'hero-stale', steps: ['shardfile', 'pack', 'upload'], match: /the hero (?:of .* is older than its content|of .* has no .* stamp)|the hero files of .* are not the ones stamped/u,
    fix: 'Capture the hero again from a served build: `wildshard hero src/shards/<name> --base <url>`.' },
  { id: 'hero-not-in-product', anchor: 'hero-not-in-product', steps: ['shardfile', 'pack', 'upload'], match: /does not carry the captured hero/u,
    fix: 'Build again after the hero capture: `wildshard build` writes a shard file that carries it.' },
  { id: 'hero-unchanged', anchor: 'hero-unchanged', steps: ['upload'], match: /the hero is unchanged since/u,
    fix: 'Capture a new hero (`wildshard hero`), then build and upload again.' },
  // the audio rules (AU5): `audio-refused` is upload's refusal of a red report; the rest are its findings, which build
  // prints with their rows (red or amber, a build never refuses on them)
  { id: 'audio-refused', anchor: 'audio-refused', steps: 'any', codes: ['audio-refused'],
    fix: 'Fix each red audio finding listed, or waive it in the shard\'s audio-waiver.json.' },
  { id: 'audio-unreadable', anchor: 'audio-unreadable', steps: 'any', codes: ['audio-unreadable'],
    fix: 'Export the recording again as AAC-LC 48 kHz, mono or stereo, in an .m4a file: this one does not read as that.' },
  { id: 'audio-container', anchor: 'audio-container', steps: 'any', codes: ['audio-container'],
    fix: 'Export the recording again as AAC-LC 48 kHz in an .m4a file, not WAV: its bytes are FLAC, AIFF, Ogg, MP3, WebM, CAF or unknown.' },
  { id: 'audio-encoding', anchor: 'audio-encoding', steps: 'any', codes: ['audio-strict-index', 'audio-wav', 'audio-sample-rate'],
    fix: 'Encode the recording as AAC-LC at 48 kHz in an .m4a file; it plays as it is, but ships larger or less safely.' },
  { id: 'audio-duration', anchor: 'audio-duration', steps: 'any', codes: ['audio-duration'],
    fix: 'Cut the recording under the maximum length the message gives, or split it in two.' },
  { id: 'audio-bitrate', anchor: 'audio-bitrate', steps: 'any', codes: ['audio-bitrate'],
    fix: 'Encode the recording at a lower bitrate: the message gives the cap for its role and channels.' },
  { id: 'audio-budget', anchor: 'audio-budget', steps: 'any', codes: ['audio-budget-amber', 'audio-budget-red', 'audio-budget-waived'],
    fix: 'Cut, shorten or re-encode recordings until the shard\'s own audio fits, or add a dated audio-waiver.json.' },
  { id: 'audio-waiver', anchor: 'audio-waiver', steps: 'any', codes: ['audio-waiver-invalid'],
    fix: 'Fix audio-waiver.json: this shard\'s slug, a date not yet past, and at least the bytes its audio holds.' },
  { id: 'shardfile-draft', anchor: 'shardfile-draft', steps: ['shardfile', 'upload'], match: /is an unprepared draft \(sdk 0\.2\)/u,
    fix: 'Run `wildshard prepare <folder> --base <url>`, then `wildshard build <folder>`; a shard repo\'s `pack:shards` does both (WILDSHARD_PREPARATION_URL).' },
  { id: 'shardfile-link', anchor: 'shardfile-link', steps: ['shardfile', 'pack'], match: /not a regular file|link is refused/u,
    fix: 'Replace links in the shard file folder with real files, then build again.' },
  { id: 'shardfile-folder-missing', anchor: 'shardfile-folder-missing', steps: ['shardfile', 'pack'], match: /(?:build|pack) needs a shard file folder|ENOENT/u,
    fix: 'Build the shard source: `wildshard build <source>` writes public/shardfiles/<slug>.shardfile.' },
  // shard-format's validator refusals (SA41's validate and stream codes), from validate, the shard file step or upload
  { id: 'shardfile-invalid', anchor: 'shardfile-invalid', steps: 'any', codes: ['archive-invalid'],
    fix: 'Upload the shard file `wildshard build` wrote, unedited: the format checks refuse this one.' },
  { id: 'shardfile-index', anchor: 'shardfile-index', steps: 'any', codes: ['index-invalid'],
    fix: 'Build again so shard.json is written for you; a hand-written shard.json must parse and fit the index schema.' },
  { id: 'shardfile-files', anchor: 'shardfile-files', steps: 'any', codes: ['file-mismatch', 'unlisted-file', 'source-hash', 'pack-invalid'],
    fix: 'Build again: the folder\'s files differ from the ones shard.json lists, so never edit a built folder by hand.' },
  { id: 'shardfile-section', anchor: 'shardfile-section', steps: 'any', codes: ['section-invalid', 'shard-schema'],
    fix: 'Give the field at the path shown the value it expects; `wildshard schema shardfile <pointer>` prints its shape.' },
  { id: 'shardfile-assets', anchor: 'shardfile-assets', steps: 'any',
    codes: ['blob-invalid', 'server-file-invalid', 'ktx2-costs', 'asset-admission', 'cook-invalid', 'runtime-files'],
    fix: 'Export the asset the message names again and build: its bytes do not match what the shard file declares.' },
  { id: 'shardfile-scripts', anchor: 'shardfile-scripts', steps: 'any', codes: ['script-side', 'script-admission'],
    fix: 'Run each behaviour script only on the side its declaration allows, then build again.' },
  { id: 'shardfile-targets', anchor: 'shardfile-targets', steps: 'any', codes: ['world-targets'],
    fix: 'Declare the item or quest the message names, or take it out of the world targets.' },
  { id: 'shardfile-stream', anchor: 'shardfile-stream', steps: 'any', codes: ['stream-cap', 'stream-miss', 'stream-changed'],
    fix: 'Shrink the file or pack the message names under the streaming cap; if the file changed mid-read, upload again.' },
  { id: 'shardfile-refused', anchor: 'shardfile-refused', steps: ['shardfile', 'pack'],
    fix: 'Build the shard source again with `wildshard build`: it writes and checks the shard file.' },
  { id: 'upload-shardfile-missing', anchor: 'upload-shardfile-missing', steps: ['upload'], match: /upload needs a shard ?file|ENOENT/u,
    fix: 'Pass the shard file `wildshard build` wrote: `wildshard upload public/shardfiles/<slug>.shardfile --channel staging`.' },
  { id: 'upload-channel', anchor: 'upload-channel', steps: ['upload'], match: /upload needs --channel/u,
    fix: 'Add `--channel staging` (try it there first) or `--channel prod`.' },
  { id: 'upload-credentials', anchor: 'upload-credentials', steps: ['upload'], match: /upload needs --server/u,
    fix: 'Set WILDSHARD_API_URL (or pass --server) and WILDSHARD_CREATOR_PRIVATE_KEY in your shell.' },
  // the account key (meta SHARD-DELETE DEL6): upload sends it on the ticket and the commit; account and whoami
  { id: 'account-key-missing', anchor: 'account-key-missing', steps: ['upload', 'account', 'delete'], match: /needs an account key|^no account key/u,
    fix: 'Run `wildshard account <email>` once, or set WILDSHARD_API_KEY to your account key.' },
  { id: 'account-exists', anchor: 'account-exists', steps: ['account'], match: /already has an account/u,
    fix: 'Use the key you saved for this email; a lost key needs an operator reset by the Wildshard team.' },
  { id: 'account-key-file', anchor: 'account-key-file', steps: ['account'], match: /already holds a key/u,
    fix: 'Keep the key you have, or pass `--force` to replace the file; the old key keeps working.' },
  { id: 'account-refused', anchor: 'account-refused', steps: ['account'],
    fix: 'Read the reason: a bad email is 400, and 429 means wait a minute and try again.' },
  // delete (meta SHARD-DELETE DEL10): start, the typed slug, finalize; account-key-missing above covers no key
  { id: 'delete-not-confirmed', anchor: 'delete-not-confirmed', steps: ['delete'], match: /not confirmed: you typed/u,
    fix: 'Nothing was deleted. Run `wildshard delete <slug>` again and type the slug exactly, or pass `--yes`.' },
  { id: 'delete-expired', anchor: 'delete-expired', steps: ['delete'], match: /waits for this confirm token/u,
    fix: 'Nothing was deleted: run `wildshard delete <slug>` again and confirm within 10 minutes.' },
  { id: 'delete-not-owner', anchor: 'delete-not-owner', steps: ['delete'], match: /belongs to another account|only the admin token can delete|(?:start|finalize) answered 401:/u,
    fix: 'Delete with the account key that first uploaded the shard; `wildshard whoami` shows which key you send.' },
  { id: 'delete-unknown', anchor: 'delete-unknown', steps: ['delete'], match: /(?:start|finalize) answered 40[04]:/u,
    fix: 'Check the slug: the API has no shard by that name (the catalogue lists every live one).' },
  { id: 'delete-refused', anchor: 'delete-refused', steps: ['delete'],
    fix: 'Read the reason: the API answered with what it wants, or the server is not https.' },
  { id: 'upload-level', anchor: 'upload-level', steps: ['upload'], match: /^invalid --level/u,
    fix: 'Pass `--level` 0 to 11, or leave it out for the default.' },
  { id: 'upload-version', anchor: 'upload-version', steps: ['upload'], match: /pass --version X\.Y\.Z|^--version \S+ is not X\.Y\.Z/u,
    fix: 'Set `version` (X.Y.Z) in the shard source\'s package.json, or pass `--version X.Y.Z`.' },
  { id: 'upload-commit', anchor: 'upload-commit', steps: ['upload'], match: /is not a git checkout|^--commit \S+ is not a full 40-hex sha/u,
    fix: 'Upload from the shard repo\'s git checkout, or pass `--commit <sha>` (40 hex) of the bytes\' commit.' },
  { id: 'upload-uncommitted', anchor: 'upload-uncommitted', steps: ['upload'], match: /has uncommitted changes/u,
    fix: 'Commit your changes, build again, then upload: the commit names the bytes.' },
  { id: 'upload-sdk-missing', anchor: 'upload-sdk-missing', steps: ['upload'], match: /is not installed at or above|\(.*package\.json\) is not X\.Y\.Z/u,
    fix: 'Run `pnpm install` in the shard repo.' },
  { id: 'upload-refused', anchor: 'upload-refused', steps: ['upload'],
    fix: 'Read the reason: a format refusal means build again (`wildshard build`); a server refusal names what it wants.' },
  // lint, besides the rules below
  { id: 'lint-not-run', anchor: 'lint-not-run', steps: ['lint'], match: /^oxlint (?:did not run|exited|report has no)/u,
    fix: 'Reinstall @wildshard/sdk (`pnpm install`): the author lint ships with it.' },
  { id: 'lint-refused', anchor: 'lint-refused', steps: ['lint'],
    fix: 'Fix what the message names at the file and line shown.' },
];

/** Wildshard's lint rules an author's source can hit (`.oxlintrc.author.json`), with the fix for each. */
const LINT_FIXES: Readonly<Record<string, string>> = {
  'wildshard-sdk/generator-imports': 'Import Wildshard code only through @wildshard/sdk\'s exports; copy what another shard has instead of importing it.',
  'wildshard/engine-internal': 'Use the shard-facing SDK export instead of the game-only engine export.',
  'wildshard/engine-sides': 'Keep client, server and shared code apart: import the shared module, not the other side\'s.',
  'wildshard/engine-words': 'Move Wildshard words (shard and game names) out of engine code into content data.',
  'wildshard/exec-max-buffer': 'Pass an explicit `maxBuffer` to the exec call that captures output.',
  'wildshard/layer': 'Import downward through the public index; a shard never imports another shard.',
  'wildshard/no-active-chunk': 'Read current content through the game layer, not the active chunk.',
  'wildshard/no-active-singleton': 'Take the service from your context instead of the active singleton.',
  'wildshard/no-authored-html': 'Set text with `textContent`, never HTML.',
  'wildshard/no-base64': 'Keep binary content binary: ship the bytes as an asset, never base64.',
  'wildshard/no-build-time-import': 'Runtime code must not import build-time code: move the shared part to a runtime module.',
  'wildshard/no-client-plan-reflection': 'Pass data to the client feature; do not reflect into shard TypeScript.',
  'wildshard/no-generated-import': 'Call the authoring function or read the built shard file folder, not a generated file.',
  'wildshard/no-generated-json-import': 'Read generated JSON as data at build time, not with an import.',
  'wildshard/no-global-listener-patch': 'Register listeners through your scope, not on globals.',
  'wildshard/no-hook-chain': 'Subscribe to the typed event instead of chaining hooks.',
  'wildshard/no-inline-ui-string': 'Put player-facing text in the shard\'s string table (data/text.json).',
  'wildshard/no-level-identity': 'Move level and style choices into content data instead of branching on identity.',
  'wildshard/no-module-mock': 'Test through a seam (pass the dependency in) instead of a module mock.',
  'wildshard/no-production-test-import': 'Move what production needs out of the test module.',
  'wildshard/no-raw-animation-mixer': 'Use the engine\'s animation API instead of a raw three.js mixer.',
  'wildshard/no-raw-hud': 'Mount HUD through the numbered HUD slots your scope owns.',
  'wildshard/no-raw-input': 'Read input through the input service, not DOM listeners.',
  'wildshard/no-raw-random-time': 'Use the engine\'s seeded random and clock, not Math.random or Date.',
  'wildshard/no-raw-save': 'Save through the saves service, not localStorage.',
  'wildshard/no-raw-shader-patch': 'Patch shaders through the shader registry.',
  'wildshard/no-reexport': 'Import from the module that defines the name; do not re-export it.',
  'wildshard/no-renderer-type': 'Keep renderer types inside rendering code; pass plain data out.',
  'wildshard/no-runtime-generator': 'Import generators only from shard.config.ts, bakers and other generators.',
  'wildshard/no-runtime-in-build': 'Build code must not import runtime code: share a plain data module instead.',
  'wildshard/no-shard-branch': 'Move the shard-specific choice into the shard\'s data or plugin.',
  'wildshard/no-shard-host-callback': 'Give host APIs data, not TypeScript callbacks.',
  'wildshard/no-shard-runtime': 'Keep the shard to authoring and declarations: gameplay goes in behaviour/ scripts.',
  'wildshard/no-url-switch': 'Drop the URL query switch; read settings from the shard\'s data.',
  'wildshard/public-index': 'Import the package by its public export, not a file path inside it.',
  'wildshard/runtime-commons': 'Runtime code must not import build-time commons; use the runtime export.',
  'wildshard/runtime-performance': 'Bound the work: no per-frame allocation, raw rendering, DOM, timers or fetch.',
  'wildshard/runtime-standalone': 'Runtime code must stand alone: import only the runtime surface.',
  'wildshard/sdk-no-facade': 'Import the SDK\'s own export; do not alias a game or engine binding.',
  'wildshard/shard-engine-imports': 'Import @wildshard/sdk, not engine internals, from shard source.',
  'wildshard/shard-game-imports': 'Import @wildshard/sdk, not the game, from shard source.',
  'wildshard/shard-game-plugins': 'Import only the game plugin exports that define your runtime.',
  'wildshard/shard-names': 'Name no particular shard outside its own folder.',
  'wildshard/shard-sandbox': 'Keep services, globals, settings and assets inside the shard\'s context.',
  'wildshard/shard-services': 'Get engine services from ShardContext.',
  'wildshard/sim-no-render': 'Keep rendering out of code the headless simulation imports.',
};

/** Every wildshard lint rule as a row: id is the config's `plugin/rule`, anchor `lint-<rule>`. */
export const LINT_RULES: readonly RefusalRule[] = Object.entries(LINT_FIXES).map(([id, fix]) => ({ id, fix, steps: ['lint'], anchor: `lint-${id.slice(id.indexOf('/') + 1)}` }));
/** Any other lint rule (oxlint's own, by its code): oxlint's help when it gives one. */
export const LINT_OTHER: RefusalRule = { id: 'lint-other', anchor: 'lint-rules', steps: ['lint'],
  fix: 'Fix what the rule names at the file and line shown; `oxlint --rules` lists it.' };

/** Every anchor GUIDE.md must have a heading for (SA13). */
export const REFUSAL_ANCHORS: readonly string[] = [...REFUSAL_RULES, ...LINT_RULES, LINT_OTHER].map(rule => rule.anchor);

const note = (rule: RefusalRule, id = rule.id, fix = rule.fix): RefusalNote => ({ rule: id, fix, guide: `${GUIDE_FILE}#${rule.anchor}` });
const appliesTo = (rule: RefusalRule, step: RefusalStep): boolean => rule.steps === 'any' || rule.steps.includes(step);
const LINT_BY_ID = new Map(LINT_RULES.map(rule => [rule.id, rule]));

/** oxlint's code (`wildshard(no-raw-save)`) as the config spells the rule (`wildshard/no-raw-save`). */
export function lintRuleId(code: string): string {
  const match = /^([\w-]+)\(([\w/-]+)\)$/u.exec(code);
  return match === null ? code : `${match[1] ?? ''}/${match[2] ?? ''}`;
}

/** shard-format's codes, each to the row that names it. */
const RULE_BY_CODE: ReadonlyMap<string, RefusalRule> = new Map(REFUSAL_RULES.flatMap(row => (row.codes ?? []).map(code => [code, row] as const)));

/** The shard-format code a refusal carries (SA41): on the error or, when sharddev wrapped it, on a cause beneath it. */
export function refusalCode(error: unknown): string | undefined {
  for (let at = error, depth = 0; typeof at === 'object' && at !== null && depth < 8; depth += 1) {
    const code: unknown = 'code' in at ? at.code : undefined;
    if (typeof code === 'string' && RULE_BY_CODE.has(code)) return code;
    at = 'cause' in at ? at.cause : undefined;
  }
  return undefined;
}

/** The rule, fix and guide link for a refusal message from `step`. A known lint rule's code wins over the message, and
 *  so does a shard-format code (SA41); the message's words are the fallback. */
export function refusalNote(step: RefusalStep, message: string, source: RefusalSource = {}): RefusalNote {
  const { lint, code } = source;
  if (lint?.code !== undefined && lint.code !== null) {
    const id = lintRuleId(lint.code), known = LINT_BY_ID.get(id);
    const help = lint.help?.split('\n')[0]?.trim() ?? '';
    return known === undefined ? note(LINT_OTHER, id, help === '' ? LINT_OTHER.fix : help) : note(known);
  }
  const coded = code === undefined ? undefined : RULE_BY_CODE.get(code);
  if (coded !== undefined) return note(coded);
  const rule = REFUSAL_RULES.find(row => appliesTo(row, step) && row.match?.test(message) === true)
    ?? REFUSAL_RULES.find(row => appliesTo(row, step) && row.match === undefined && row.codes === undefined);
  if (rule === undefined) throw new Error(`no refusal rule for step ${step}`);
  return note(rule);
}

/** The line printed under a refusal: `[rule] fix: ... (GUIDE.md#anchor)`. */
export function refusalHint(refusal: RefusalNote): string {
  return `[${refusal.rule}] fix: ${refusal.fix} (${refusal.guide})`;
}
