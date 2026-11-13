import { describe, expect, it } from 'vitest';
import { checkLines, lintOutcome, runCheck, type CheckSteps, type StepOutcome } from './check';

const pass = async (): Promise<StepOutcome> => await Promise.resolve({ status: 'pass' });
const steps = (overrides: Partial<CheckSteps> = {}): CheckSteps => ({ lint: pass, build: pass, validate: pass, prove: pass, report: pass, ...overrides });
function clock(): () => number { let tick = 0; return (): number => (tick += 10); }

describe('wildshard check (SA4)', () => {
  it('passes when every step passes or skips, timing each step in order', async () => {
    const result = await runCheck('/p', () => '/p/out', steps({ prove: async () => await Promise.resolve({ status: 'skip', note: 'no proof.json' }) }), clock());
    expect(result.verdict).toBe('pass');
    expect(result.steps.map(step => [step.name, step.status])).toEqual([['lint', 'pass'], ['build', 'pass'], ['validate', 'pass'], ['prove', 'skip'], ['report', 'pass']]);
    expect(result.steps.every(step => step.ms === 10)).toBe(true);
    expect(result).toMatchObject({ version: 1, project: '/p', output: '/p/out', refusals: [] });
  });

  it('turns a thrown step into a fail with its words, and skips what needs the build', async () => {
    const result = await runCheck('/p', () => '/p/out', steps({ build: async () => await Promise.reject(new Error('no generators/product.ts')) }), clock());
    expect(result.verdict).toBe('fail');
    expect(result.steps.map(step => step.status)).toEqual(['pass', 'fail', 'skip', 'skip', 'skip']);
    expect(result.steps[2]?.note).toBe('build failed');
    expect(result.refusals).toEqual([{ step: 'build', rule: null, message: 'no generators/product.ts', fix: null }]);
    expect(result.output).toBeNull();
  });

  it('keeps going after a lint failure so the author sees every refusal', async () => {
    const lint = async (): Promise<StepOutcome> => await Promise.resolve({ status: 'fail', refusals: [{ rule: 'eslint(no-unused-vars)', message: 'b is unused', fix: 'Remove it.' }] });
    const result = await runCheck('/p', () => '/o', steps({ lint }), clock());
    expect(result.verdict).toBe('fail');
    expect(result.steps.map(step => step.status)).toEqual(['fail', 'pass', 'pass', 'pass', 'pass']);
    expect(checkLines(result)).toContain('  lint [eslint(no-unused-vars)]: b is unused; fix: Remove it.');
    expect(checkLines(result).at(-1)).toMatch(/^check fail in /u);
  });

  it('reads oxlint JSON into refusals with rule, fix and place', () => {
    const report = JSON.stringify({ number_of_files: 1, diagnostics: [{ message: "Variable 'b' is unused.", code: 'eslint(no-unused-vars)', help: 'Consider removing this declaration.', filename: 'x/a.ts', labels: [{ span: { line: 2, column: 7 } }] }, { message: 'Primary shard runtime source is forbidden', code: 'wildshard(no-shard-runtime)', filename: 'x/b.ts' }] });
    expect(lintOutcome(report, 1)).toEqual({ status: 'fail', refusals: [
      { rule: 'eslint(no-unused-vars)', message: "Variable 'b' is unused.", fix: 'Consider removing this declaration.', file: 'x/a.ts:2:7' },
      { rule: 'wildshard(no-shard-runtime)', message: 'Primary shard runtime source is forbidden', fix: null, file: 'x/b.ts' },
    ] });
    expect(lintOutcome(JSON.stringify({ number_of_files: 3, diagnostics: [] }), 0)).toEqual({ status: 'pass' });
    expect(lintOutcome('No files found to lint. Please check your paths and ignore patterns.', 1).status).toBe('skip');
    expect(lintOutcome('Failed to parse oxlint configuration file.', 1).status).toBe('fail');
  });
});
