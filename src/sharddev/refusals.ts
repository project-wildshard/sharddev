// SHARD-AUTHORING SA21 (J317, "the first ten minutes"): every refusal an author can hit in `wildshard` (lint, build,
// validate, prove, the report card, new, the shard file build writes (and `pack`, its deprecated alias, SA3) and upload's
// local checks) names a stable rule id, a one-line fix and a
// GUIDE.md section. This file is the one table. GUIDE.md (SA13) writes one heading per anchor below, so
// `GUIDE.md#<anchor>` lands on it; refusals.test.ts fails a row with no fix or anchor and a wildshard lint rule with no
// row. Rule ids are stable: rename one only together with its GUIDE.md heading. A message takes the first row (in table
// order) for its step whose pattern matches, else its step's catch-all (the row with no pattern), wherever that sits.
//
// Messages stay as the refusing code (and shard-format) words them: a row matches them, it never rewrites them.

/** Where a refusal came from: `check`'s five steps, then the other verbs. `shardfile` is the shard file build writes (SA3). */
export type RefusalStep = 'lint' | 'build' | 'validate' | 'prove' | 'report' | 'new' | 'shardfile' | 'pack' | 'upload';
/** One rule: its id, its GUIDE.md anchor, the fix, and the refusal messages it names (none: the step's catch-all). */
export interface RefusalRule {
  readonly id: string;
  readonly anchor: string;
  readonly fix: string;
  readonly steps: readonly RefusalStep[] | 'any';
  readonly match?: RegExp;
}
/** What a printed refusal carries besides its message. `guide` is `GUIDE.md#<anchor>`. */
export interface RefusalNote { readonly rule: string; readonly fix: string; readonly guide: string }

/** The author's manual: shipped in the package and written into a project by `wildshard new` (SA13). */
export const GUIDE_FILE = 'GUIDE.md';

/** The refusals that are not lint rules, most specific first; each step has one catch-all (no `match`). */
export const REFUSAL_RULES: readonly RefusalRule[] = [
  { id: 'usage', anchor: 'usage', steps: 'any', match: /^usage: |^unknown (?:wildshard command|build flag|command)|unknown or incomplete build map flag|^Unknown schema root|accepts no pointer|^dev port must be|^invalid --port\b|^(?:validate|prove) requires a format-2 shard\.json or author project/u,
    fix: 'Run `wildshard --help` and give the verb the arguments and flags it lists.' },
  // new
  { id: 'new-target', anchor: 'new-target', steps: ['new'], match: /new requires a fresh directory and kebab-case slug/u,
    fix: 'Name a folder that does not exist yet and a kebab-case slug: `wildshard new my-isle`.' },
  { id: 'new-refused', anchor: 'new-refused', steps: ['new'],
    fix: 'Reinstall @wildshard/sdk (`pnpm install`); `new` copies the reference world shipped with it.' },
  // build
  { id: 'source-file-missing', anchor: 'source-file-missing', steps: ['build', 'validate', 'prove'], match: /ENOENT: no such file or directory|Cannot resolve entry module/u,
    fix: 'Check the path shown: the project or product folder, or a file it names, is not there.' },
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
    fix: 'Name the project folder after the shard\'s slug (data/identity.json), or change the slug to the folder\'s name.' },
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
  // the report card (budgets, J303); a metric is shard-format's name for it
  { id: 'budget-unmeasured', anchor: 'budget-unmeasured', steps: ['report'], match: /measurement required|missing execution samples|^invalid measured/u,
    fix: 'Run the shard long enough to measure: `wildshard check` measures it headlessly; native gameplay needs a browser proof.' },
  { id: 'budget-download', anchor: 'budget-download', steps: ['report'], match: /download (?:budget )?bytes/u,
    fix: 'Shrink or drop assets on the named download tier, or move them to a later tier.' },
  { id: 'budget-draws', anchor: 'budget-draws', steps: ['report'], match: /\bdraws\b/u,
    fix: 'Merge meshes that share a material, or cut objects from the named view.' },
  { id: 'budget-triangles', anchor: 'budget-triangles', steps: ['report'], match: /\btriangles\b/u,
    fix: 'Lower the mesh detail (LODs, fewer props) in the named view.' },
  { id: 'budget-memory', anchor: 'budget-memory', steps: ['report'], match: /resident target|loading total bytes|playing total bytes/u,
    fix: 'Cut texture size or count and mesh bytes until the named total fits.' },
  { id: 'budget-script-cpu', anchor: 'budget-script-cpu', steps: ['report'], match: /^script CPU/u,
    fix: 'Do less work per tick in behaviour scripts: spread it over ticks or run it on events.' },
  { id: 'budget-script-fuel', anchor: 'budget-script-fuel', steps: ['report'], match: /^script fuel/u,
    fix: 'Shorten the hottest behaviour script loops; fuel counts instructions per tick.' },
  { id: 'budget-over', anchor: 'budget-over', steps: ['report'],
    fix: 'Run `wildshard check`: its report step names each budget over its limit and the row here for each.' },
  { id: 'budget-refused', anchor: 'budget-refused', steps: ['build', 'validate'], match: /Performance report refused/u,
    fix: 'Run `wildshard check`: its report step names each budget over its limit and the row here for each.' },
  // the shard file build writes (SA3; `pack` is its deprecated alias) and upload, before a byte is sent. `shardfile-draft` is
  // a warning from build and check and a refusal from upload (draft.ts).
  { id: 'hero-stale', anchor: 'hero-stale', steps: ['shardfile', 'pack', 'upload'], match: /the hero (?:of .* is older than its content|of .* has no .* stamp)|the hero files of .* are not the ones stamped/u,
    fix: 'Capture the hero again from a served build: `wildshard hero src/shards/<name> --base <url>`.' },
  { id: 'hero-not-in-product', anchor: 'hero-not-in-product', steps: ['shardfile', 'pack', 'upload'], match: /does not carry the captured hero/u,
    fix: 'Build again after the hero capture: `wildshard build` writes a shard file that carries it.' },
  { id: 'hero-unchanged', anchor: 'hero-unchanged', steps: ['upload'], match: /the hero is unchanged since/u,
    fix: 'Capture a new hero (`wildshard hero`), then build and upload again.' },
  { id: 'audio-refused', anchor: 'audio-refused', steps: ['pack', 'upload'], match: /^Audio rules \(AU5\) refuse/u,
    fix: 'Fix each red audio finding listed, or waive it in the shard\'s audio-waiver.json.' },
  { id: 'shardfile-draft', anchor: 'shardfile-draft', steps: ['shardfile', 'upload'], match: /is an unprepared draft \(sdk 0\.2\)/u,
    fix: 'Run `wildshard prepare <folder> --base <url>`, then `wildshard build <folder>`; a shard repo\'s pack:shards does both (WILDSHARD_PREPARATION_URL).' },
  { id: 'shardfile-link', anchor: 'shardfile-link', steps: ['shardfile', 'pack'], match: /not a regular file|link is refused/u,
    fix: 'Replace links in the shard file folder with real files, then build again.' },
  { id: 'shardfile-folder-missing', anchor: 'shardfile-folder-missing', steps: ['shardfile', 'pack'], match: /(?:build|pack) needs a shard file folder|ENOENT/u,
    fix: 'Build the project: `wildshard build <project>` writes public/shardfiles/<slug>.shardfile.' },
  { id: 'shardfile-invalid', anchor: 'shardfile-invalid', steps: ['shardfile', 'pack', 'upload'], match: /^no \S+ in the shardfile|is larger than \d+ bytes|Invalid [a-z]+: /u,
    fix: 'Upload the shard file `wildshard build` wrote, unedited: the format checks refuse this one.' },
  { id: 'shardfile-refused', anchor: 'shardfile-refused', steps: ['shardfile', 'pack'],
    fix: 'Build the project again with `wildshard build`: it writes and checks the shard file.' },
  { id: 'upload-shardfile-missing', anchor: 'upload-shardfile-missing', steps: ['upload'], match: /upload needs a shardfile|ENOENT/u,
    fix: 'Pass the shard file `wildshard build` wrote: `wildshard upload public/shardfiles/<slug>.shardfile --channel staging`.' },
  { id: 'upload-channel', anchor: 'upload-channel', steps: ['upload'], match: /upload needs --channel/u,
    fix: 'Add `--channel staging` (try it there first) or `--channel prod`.' },
  { id: 'upload-credentials', anchor: 'upload-credentials', steps: ['upload'], match: /upload needs --server/u,
    fix: 'Set WILDSHARD_API_URL (or pass --server) and WILDSHARD_CREATOR_PRIVATE_KEY in your shell.' },
  { id: 'upload-level', anchor: 'upload-level', steps: ['upload'], match: /^invalid --level/u,
    fix: 'Pass `--level` 0 to 11, or leave it out for the default.' },
  { id: 'upload-version', anchor: 'upload-version', steps: ['upload'], match: /pass --version X\.Y\.Z|^--version \S+ is not X\.Y\.Z/u,
    fix: 'Set `version` (X.Y.Z) in the shard project\'s package.json, or pass `--version X.Y.Z`.' },
  { id: 'upload-commit', anchor: 'upload-commit', steps: ['upload'], match: /is not a git checkout|^--commit \S+ is not a full 40-hex sha/u,
    fix: 'Upload from the shard project\'s git checkout, or pass `--commit <sha>` (40 hex) of the bytes\' commit.' },
  { id: 'upload-uncommitted', anchor: 'upload-uncommitted', steps: ['upload'], match: /has uncommitted changes/u,
    fix: 'Commit your changes, build again, then upload: the commit names the bytes.' },
  { id: 'upload-sdk-missing', anchor: 'upload-sdk-missing', steps: ['upload'], match: /is not installed at or above|\(.*package\.json\) is not X\.Y\.Z/u,
    fix: 'Run `pnpm install` in the shard project.' },
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
  'wildshard/no-generated-import': 'Call the authoring function or read the built product, not a generated file.',
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

/** The rule, fix and guide link for a refusal message from `step`. A known lint rule's code wins over the message. */
export function refusalNote(step: RefusalStep, message: string, lint?: { readonly code: string | null; readonly help: string | null }): RefusalNote {
  if (lint?.code !== undefined && lint.code !== null) {
    const id = lintRuleId(lint.code), known = LINT_BY_ID.get(id);
    const help = lint.help?.split('\n')[0]?.trim() ?? '';
    return known === undefined ? note(LINT_OTHER, id, help === '' ? LINT_OTHER.fix : help) : note(known);
  }
  const rule = REFUSAL_RULES.find(row => appliesTo(row, step) && row.match?.test(message) === true)
    ?? REFUSAL_RULES.find(row => appliesTo(row, step) && row.match === undefined);
  if (rule === undefined) throw new Error(`no refusal rule for step ${step}`);
  return note(rule);
}

/** The line printed under a refusal: `[rule] fix: ... (GUIDE.md#anchor)`. */
export function refusalHint(refusal: RefusalNote): string {
  return `[${refusal.rule}] fix: ${refusal.fix} (${refusal.guide})`;
}
