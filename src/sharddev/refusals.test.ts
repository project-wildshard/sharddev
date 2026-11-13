// SHARD-AUTHORING SA21 (J317): every refusal names a rule id, a one-line fix and a GUIDE.md section. The table must be
// whole, and a seeded set of bad shards, run through the real `check`, must print all three for every refusal.
// oxlint-disable-next-line import/no-nodejs-modules -- Seed bad projects under the repository's tmp.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only owned fixture paths.
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { issueCodeRows, issueError } from '@wildshard/format/issue-codes';
import { readTar } from '@wildshard/format/tar';
import { GUIDE_FILE, LINT_OTHER, LINT_RULES, REFUSAL_ANCHORS, REFUSAL_RULES, lintRuleId, refusalCode, refusalNote, type RefusalStep } from './refusals';
import { checkLines, lintOutcome, runCheck, type CheckResult, type StepOutcome } from './check';
import { checkProject } from './checkProject';
import { newProject } from './project';
import { runCli } from './cli';
import { draftMessage } from './draft';

const ALL = [...REFUSAL_RULES, ...LINT_RULES, LINT_OTHER];
const STEPS: readonly RefusalStep[] = ['lint', 'build', 'validate', 'prove', 'report', 'new', 'update', 'shardfile', 'pack', 'upload', 'account', 'delete'];

describe('the refusal table (SA21)', () => {
  it('gives every rule id a one-line fix and a GUIDE.md anchor, each unique', () => {
    for (const rule of ALL) {
      expect(rule.id, rule.id).toMatch(/^[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)?$/u);
      expect(rule.anchor, rule.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      expect(rule.fix, rule.id).toMatch(/^\S[^\n]{10,150}\.$/u);
    }
    expect(new Set(ALL.map(rule => rule.id)).size).toBe(ALL.length);
    expect(new Set(REFUSAL_ANCHORS).size).toBe(REFUSAL_ANCHORS.length);
  });

  it('gives every step one catch-all, so no refusal goes without a rule', () => {
    for (const step of STEPS) {
      expect(REFUSAL_RULES.filter(row => row.match === undefined && row.codes === undefined && row.steps !== 'any' && row.steps.includes(step)), step).toHaveLength(1);
      const rule = refusalNote(step, 'something nobody has seen yet').rule;
      expect(REFUSAL_RULES.find(row => row.id === rule)?.match, `${step}: ${rule}`).toBeUndefined();
    }
  });

  it('has a row for every wildshard lint rule the author config turns on', () => {
    const config = readFileSync(resolve(import.meta.dirname, '../../.oxlintrc.author.json'), 'utf8');
    const enabled = new Set([...config.matchAll(/"(wildshard(?:-sdk)?\/[a-z0-9-]+)"/gu)].map(match => match[1]));
    expect(enabled.size).toBeGreaterThan(40);
    const rows = new Set(LINT_RULES.map(rule => rule.id));
    expect([...enabled].filter(id => !rows.has(id ?? ''))).toEqual([]);
    expect([...rows].filter(id => !enabled.has(id))).toEqual([]);
  });

  it('reads lint diagnostics: wildshard rules by row, other rules with oxlint\'s help', async () => {
    expect(lintRuleId('wildshard-sdk(generator-imports)')).toBe('wildshard-sdk/generator-imports');
    const report = JSON.stringify({ number_of_files: 1, diagnostics: [
      { message: 'generator-imports: this import reaches into another shard\'s source', code: 'wildshard-sdk(generator-imports)', filename: 'src/shards/a/generators/x.ts' },
      { message: "Variable 'b' is unused.", code: 'eslint(no-unused-vars)', help: 'Consider removing this declaration.', filename: 'a.ts' },
      { message: 'parse error' }] });
    const outcome = lintOutcome(report, 1), pass = async (): Promise<StepOutcome> => await Promise.resolve({ status: 'pass' });
    const result = await runCheck('/p', () => null, { lint: async () => await Promise.resolve(outcome), build: pass, validate: pass, prove: pass, report: pass });
    expect(result.refusals.map(row => [row.rule, row.guide])).toEqual([
      ['wildshard-sdk/generator-imports', `${GUIDE_FILE}#lint-generator-imports`],
      ['eslint/no-unused-vars', `${GUIDE_FILE}#lint-rules`],
      ['lint-refused', `${GUIDE_FILE}#lint-refused`]]);
    expect(result.refusals[1]?.fix).toBe('Consider removing this declaration.');
  });

  it('names each report-card metric shard-format refuses, by its code', () => {
    const metrics: Readonly<Record<string, string>> = {
      'perf-critical-download': 'budget-download', 'perf-library-download-budget': 'budget-download', 'perf-far-draws': 'budget-draws',
      'perf-tile-triangles': 'budget-triangles', 'perf-playing-memory': 'budget-memory', 'perf-script-cpu': 'budget-script-cpu',
      'perf-script-fuel': 'budget-script-fuel', 'perf-script-samples-missing': 'budget-unmeasured', 'perf-native-resident-unmeasured': 'budget-unmeasured',
      'perf-script-sample-invalid': 'budget-unmeasured',
    };
    // The code names the rule; the metric's words do not (`far draws` words a draws row, the code a download one here).
    for (const [code, rule] of Object.entries(metrics)) expect(refusalNote('report', 'far draws: 9 over 1', { code }).rule, code).toBe(rule);
    // Words with no code are the report step's catch-all: no row reads shard-format's metric words any more.
    expect(refusalNote('report', 'script CPU p95 us/tick: 9 over 1').rule).toBe('budget-over');
    // `build` and `validate` refuse the whole card in one line, in sharddev's own words (no code).
    for (const step of ['build', 'validate'] as const) expect(refusalNote(step, 'Performance report refused this shard').rule).toBe('budget-refused');
  });

  // SA41: shard-format gives every issue a stable code; each one must name a rule, so a code added upstream with no row
  // here fails this test (and GUIDE.md's anchor test covers the row's heading).
  it('names every shard-format issue code, from every step, by exactly one row', () => {
    const codes = issueCodeRows().map(row => row.code);
    expect(codes.length).toBeGreaterThanOrEqual(53);
    expect(codes).toContain('audio-container');
    const named = REFUSAL_RULES.flatMap(row => (row.codes ?? []).map(code => [code, row.id] as const));
    const unmapped = codes.filter(code => !named.some(([listed]) => listed === code));
    expect(unmapped, 'shard-format codes no row in refusals.ts names').toEqual([]);
    expect(named.map(([code]) => code).filter(code => !codes.includes(code)), 'rows naming a code shard-format does not have').toEqual([]);
    expect(new Set(named.map(([code]) => code)).size, 'a code named by two rows').toBe(named.length);
    for (const code of codes) {
      const rule = named.find(([listed]) => listed === code)?.[1];
      for (const step of STEPS) expect(refusalNote(step, 'words no row matches', { code }).rule, `${step} ${code}`).toBe(rule);
      expect(REFUSAL_ANCHORS, code).toContain(REFUSAL_RULES.find(row => row.id === rule)?.anchor);
    }
  });

  it('reads the code off shard-format\'s real refusals, through a cause sharddev wrapped them in', () => {
    let refused: unknown;
    try { readTar(new Uint8Array(100)); } catch (error) { refused = error; }
    expect(refusalCode(refused)).toBe('archive-invalid');
    expect(refusalCode(new Error('shard file step failed', { cause: refused }))).toBe('archive-invalid');
    expect(refusalNote('upload', 'tar: whatever words', { code: refusalCode(refused) }).rule).toBe('shardfile-invalid');
    // A host's code (Node's ENOENT) is not shard-format's: the words still name the rule.
    expect(refusalCode(Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }))).toBeUndefined();
    expect(refusalCode('not an error')).toBeUndefined();
  });

  // src/cli's tests run pack and upload's refusals through the real CLI (main.test.ts, hero.test.ts, upload.test.ts).
  it('names the refusals whose words come from elsewhere', () => {
    expect(refusalNote('upload', 'upload needs --channel staging or --channel prod, not --channel live').rule).toBe('upload-channel');
    // shard-format's audio rules (AU5) refuse with a code; shardfile-audio.test.ts holds the real refusal.
    const audio = issueError('audio-refused', 'Audio rules (AU5) refuse loud-test: loud-test holds 11.00 MB of its own audio');
    expect(refusalNote('upload', audio.message, { code: refusalCode(audio) }).rule).toBe('audio-refused');
    expect(refusalNote('validate', 'Build failed with 1 error: Cannot resolve entry module x/shard.config.ts.').rule).toBe('source-file-missing');
  });
});

describe('a seeded set of bad shards through the real check (SA21)', () => {
  let scratch = '';
  const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  beforeAll(() => { mkdirSync('tmp', { recursive: true }); scratch = mkdtempSync(resolve('tmp', 'refusal-shards-')); });
  afterAll(() => { log.mockRestore(); rmSync(scratch, { recursive: true, force: true }); });

  /** A fresh empty project named `slug` under its own case folder, with `edit` applied. */
  function seeded(name: string, edit: (project: string) => void): string {
    const project = resolve(scratch, name, 'isle');
    mkdirSync(resolve(scratch, name));
    newProject(project, 'isle');
    edit(project);
    return project;
  }
  function expectNamed(result: CheckResult, rules: readonly string[]): void {
    expect(result.verdict).toBe('fail');
    expect(result.refusals.map(row => row.rule)).toEqual(rules);
    const lines = checkLines(result);
    for (const refusal of result.refusals) {
      const rule = ALL.find(row => row.id === refusal.rule);
      expect(rule, refusal.rule).toBeDefined();
      expect(refusal.fix).toBe(rule?.fix);
      expect(refusal.guide).toBe(`${GUIDE_FILE}#${rule?.anchor ?? ''}`);
      expect(lines).toContain(`    [${refusal.rule}] fix: ${refusal.fix} (${refusal.guide})`);
    }
  }
  const check = async (project: string): Promise<CheckResult> => await checkProject(project, resolve(project, '../out'));

  it('a missing project, a config with no default export, a syntax error and a broken JSON row', async () => {
    expectNamed(await check(resolve(scratch, 'nowhere', 'isle')), ['source-file-missing']);
    expectNamed(await check(seeded('no-default', project => { writeFileSync(resolve(project, 'shard.config.ts'), 'export const product = 1;\n'); })), ['config-default-export']);
    expectNamed(await check(seeded('syntax', project => { writeFileSync(resolve(project, 'shard.config.ts'), 'export const = ;\n'); })), ['source-syntax']);
    expectNamed(await check(seeded('json', project => {
      writeFileSync(resolve(project, 'data/extra.json'), '{ "rows": [');
      writeFileSync(resolve(project, 'data/card.ts'), `import extra from './extra.json' with { type: 'json' };\nexport const EXTRA = extra;\n${readFileSync(resolve(project, 'data/card.ts'), 'utf8')}`);
    })), ['json-syntax']);
  });

  it('a field the schema refuses and a broken proof tape', async () => {
    expectNamed(await check(seeded('slug', project => {
      const card = resolve(project, 'data/card.ts');
      writeFileSync(card, readFileSync(card, 'utf8').replaceAll('"isle"', '"Bad Slug!"'));
    })), ['source-schema']);
    expectNamed(await check(seeded('proof', project => { writeFileSync(resolve(project, 'proof.json'), '{ "steps": 3 }'); })), ['proof-tape-invalid']);
  });

  it('passes a fresh project with one warning: its shard file is an unprepared draft (J198)', async () => {
    const result = await check(seeded('draft', () => undefined));
    expect(result.refusals.filter(row => row.step !== 'lint')).toEqual([]);
    expect(result.steps.find(step => step.name === 'build')?.status).toBe('pass');
    expect(result.warnings).toEqual([{ step: 'build', rule: 'shardfile-draft', message: draftMessage('isle'), fix: REFUSAL_RULES.find(row => row.id === 'shardfile-draft')?.fix, guide: `${GUIDE_FILE}#shardfile-draft` }]);
    expect(checkLines(result)).toEqual(expect.arrayContaining([`  build: warning: ${draftMessage('isle')}`, expect.stringMatching(/^ {4}\[shardfile-draft\] fix: /u)]));
  });

  it('prints the rule, fix and guide under the refusal of every other author verb', async () => {
    const taken = seeded('taken', () => undefined);
    await expect(runCli(['new', taken])).rejects.toThrow(`[new-target] fix: ${REFUSAL_RULES.find(row => row.id === 'new-target')?.fix ?? ''} (${GUIDE_FILE}#new-target)`);
    await expect(runCli(['validate', resolve(scratch, 'nowhere', 'other.json')])).rejects.toThrow(`(${GUIDE_FILE}#usage)`);
    await expect(runCli(['build', taken, resolve(scratch, 'taken-out'), '--unknown-flag'])).rejects.toThrow('[usage] fix:');
    const product = resolve(scratch, 'not-a-product');
    mkdirSync(product);
    writeFileSync(resolve(product, 'shard.json'), '{}');
    // shard-format refuses `{}` as an index with its code (SA41), which names the rule.
    await expect(runCli(['validate', product])).rejects.toThrow(`(${GUIDE_FILE}#shardfile-index)`);
    await expect(runCli(['prove', taken, resolve(scratch, 'absent-proof.json')])).rejects.toThrow(/^absent-proof\.json: ENOENT[^\n]*\n {2}\[source-file-missing\] fix: /u);
  });
});

describe('the shard file build writes (SA3)', () => {
  it('names the hero, link and format refusals of the shard file step, as pack did', () => {
    const stale = 'the hero of dunes is older than its content (captured 2026-11-12T00:00:00.000Z); serve this candidate';
    expect(refusalNote('shardfile', stale).rule).toBe('hero-stale');
    expect(refusalNote('pack', stale).rule).toBe('hero-stale');
    expect(refusalNote('shardfile', 'the shard file folder out/dunes does not carry the captured hero (thumb)').rule).toBe('hero-not-in-product');
    expect(refusalNote('shardfile', 'not a regular file: out/dunes/link.json').rule).toBe('shardfile-link');
    expect(refusalNote('shardfile', "ENOENT: no such file or directory, scandir 'out/dunes'").rule).toBe('shardfile-folder-missing');
    expect(refusalNote('shardfile', 'no shard.json in the shardfile', { code: 'index-invalid' }).rule).toBe('shardfile-index');
    expect(refusalNote('shardfile', 'Invalid shardfile: bad index', { code: 'shard-schema' }).rule).toBe('shardfile-section');
    expect(refusalNote('pack', 'pack needs a shard file folder').rule).toBe('shardfile-folder-missing');
  });

  // QA 11-13 row 2 (J198, J259): one rule for a draft, a warning from build and check, a refusal from upload.
  it('names an unprepared draft shardfile-draft, in build\'s warning and upload\'s refusal', () => {
    const message = draftMessage('dunes');
    expect(message).toMatch(/^dunes is an unprepared draft \(sdk 0\.2\): /u);
    for (const step of ['shardfile', 'upload'] as const) expect(refusalNote(step, message)).toEqual({ rule: 'shardfile-draft', guide: `${GUIDE_FILE}#shardfile-draft`, fix: REFUSAL_RULES.find(row => row.id === 'shardfile-draft')?.fix });
    expect(REFUSAL_RULES.find(row => row.id === 'shardfile-draft')?.fix).toMatch(/wildshard prepare .*wildshard build <folder>.*WILDSHARD_PREPARATION_URL/u);
  });

});
