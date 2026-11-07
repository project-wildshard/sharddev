// G454: build output, not a hand-maintained list of supposedly shared hosts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from '@typescript/typescript6';
import { hostAnalysis } from '../lint/host-callbacks.mjs';
import { referenceData } from './docs/gen-shardfile-reference.mjs';
import { formatSource } from '@wildshard/engine/scripts/format-package.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const AUDIT = 'progress/shard-platform/host-audit-2026-10-16/README.md';
const keyOf = row => `${row.module}#${row.export}`;
const hash = text => createHash('sha256').update(text).digest('hex');
const order = (a, b) => a.localeCompare(b);
const verdict = (status, evidence) => ({ status, evidence });
const review = reason => verdict('needs-review', reason);

/** Machine findings are evidence, never a substitute for the semantic host grill. */
export function hostVerdicts(users, callbacks, audited, sourceHash) {
  const results = {
    twoRealUsers: review(`${users.length} resolved calling shards; verify entry reach and live adoption before granting shared credit`),
    noShardNouns: review(`Semantic review required; see ${AUDIT}`),
    dataOnly: callbacks.length > 0 ? verdict('fail', `${callbacks.length} shard TS callback values cross this host`)
      : review('No explicit shard callbacks found; host parameter semantics still require review'),
    serverSafe: review('Import/DOM and server execution review required; client presentation is labelled separately'),
    deletionTest: review('A reviewer must judge whether this survives deletion of its first shard'),
  };
  if (typeof sourceHash === 'string' && audited?.sourceHash === sourceHash && audited.evidence) for (const test of ['twoRealUsers', 'noShardNouns', 'dataOnly', 'serverSafe', 'deletionTest']) {
    if (test === 'dataOnly' && callbacks.length > 0) continue;
    const status = audited.verdicts?.[test];
    if (status === 'pass' || status === 'fail') results[test] = verdict(status, audited.evidence);
  }
  return results;
}

/** Inventory resolved call targets plus pending hosts. Planned W3 users are never real-user evidence. */
export function hostCatalogue(root = ROOT, reference = referenceData(root)) {
  const analysis = hostAnalysis(root), { program, checker } = analysis, hosts = new Map();
  const get = identity => {
    const key = keyOf(identity);
    if (!hosts.has(key)) hosts.set(key, { module: identity.module, export: identity.export, calls: [], callbacks: [], pendingUsers: [] });
    return hosts.get(key);
  };
  for (const file of analysis.files.toSorted(order)) {
    const scan = analysis.scan(file);
    for (const call of scan.calls) get(call).calls.push(call);
    for (const callback of scan.callbacks) get(callback).callbacks.push(callback);
  }
  const pendingPath = resolve(root, 'lint/platform-pending-users.json');
  const pending = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, 'utf8')).entries : [];
  for (const row of pending) {
    const host = get({ module: row.module, export: row.export ?? '*' });
    host.pendingUsers.push(row);
    if (row.export === undefined && host.calls.length === 0) for (const called of hosts.values()) {
      if (called !== host && called.module === row.module) { host.calls.push(...called.calls); host.callbacks.push(...called.callbacks); }
    }
  }
  const reviewsPath = resolve(root, 'lint/host-reviews.json');
  const reviews = existsSync(reviewsPath) ? JSON.parse(readFileSync(reviewsPath, 'utf8')).entries : {};
  const sectionFile = program.getSourceFile(formatSource(root, 'sections.ts'));
  const registry = sectionFile?.statements.find(node => ts.isInterfaceDeclaration(node) && node.name.text === 'PlatformSections');
  if (!registry) throw new Error('Host catalogue requires the public PlatformSections registry');
  const sections = registry.members.filter(ts.isPropertySignature).map(member => {
    const type = checker.getTypeAtLocation(member);
    const readers = [...hosts.values()].filter(host => host.export !== '*').flatMap(host => host.calls.filter(call => call.strings.includes(member.name.text)));
    return { name: member.name.text, type: member.type?.getText(sectionFile) ?? '', readers,
      hosts: [...new Set(readers.map(keyOf))].sort(order), users: [...new Set(readers.map(call => call.file.split('/')[2]))].sort(order),
      fields: checker.getPropertiesOfType(type).map(field => ({ name: field.name,
        type: checker.typeToString(checker.getTypeOfSymbolAtLocation(field, member)) })).sort((a, b) => a.name.localeCompare(b.name)) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const rows = [...hosts.values()].map(row => {
    const users = [...new Set(row.calls.map(call => call.file.split('/')[2]))].sort(order);
    const source = program.getSourceFile(resolve(root, row.module));
    const sourceHash = source ? hash(source.text) : null;
    return { module: row.module, export: row.export, calls: row.calls, callbacks: row.callbacks,
      pendingUsers: row.pendingUsers, users, sourceHash,
      verdicts: hostVerdicts(users, row.callbacks, reviews[keyOf(row)] ?? reviews[`${row.module}#*`], sourceHash), review: { source: AUDIT, revision: '9160141e3',
        status: 'Historical review; not silently promoted to a current five-test pass' } };
  }).sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  return { schema: 'wildshard.host-catalogue/1',
    coverage: 'Resolved calls/new expressions in non-frozen play TS; aliases, inherited methods and named callbacks. Indirect/dynamic calls and semantic host tests require review. No imports or planned W3 users count as actual users.',
    sections, fields: reference.fields, wasm: { contract: reference.contract, signatures: reference.abi }, hosts: rows };
}

export function renderHostCatalogue(catalogue) {
  const cell = value => String(value).replaceAll('|', String.raw`\|`).replaceAll('\n', ' ');
  const lines = ['# Host catalogue (generated)', '', catalogue.coverage, '',
    'Five verdicts: two real users / no shard nouns / data-only / server-safe / deletion test. `needs-review` grants no pass.', '',
    '## Sections', '', 'Readers below are statically resolved literal section reads; dynamic/host-internal access still needs review.', '',
    '| Section | Fields | Reading hosts | Calling shards |', '|---|---|---|---|',
    ...catalogue.sections.map(row => `| ${cell(row.name)} | ${row.fields.map(field => cell(field.name)).join(', ')} | ${row.hosts.map(cell).join(', ')} | ${row.users.map(cell).join(', ')} |`), '',
    'Full schema field inventory and exact Wasm ABI: [SHARDFILE.md](SHARDFILE.md). Machine-readable detail: `lint/host-catalogue.generated.json`.', '',
    '## Hosts', '', '| Host | Resolved calling shards | Planned W3 users | Five verdicts |', '|---|---|---|---|',
    ...catalogue.hosts.map(row => `| ${cell(keyOf(row))} | ${row.users.length === 0 ? 'none proven' : row.users.map(cell).join(', ')} | ${[...new Set(row.pendingUsers.map(pending => pending.shard ?? `approved: ${pending.approvedFeature?.name ?? 'unknown'}`))].map(cell).join(', ')} | ${Object.values(row.verdicts).map(result => result.status).join(' / ')} |`)];
  return `${lines.join('\n')}\n`;
}

/** pnpm docs publishes both the JSON retained in deploy trees and the human-readable generated page. */
export function writeHostCatalogue(root = ROOT) {
  const catalogue = hostCatalogue(root);
  const outputs = { 'lint/host-catalogue.generated.json': `${JSON.stringify(catalogue, null, 2)}\n`, 'docs/api/HOSTS.md': renderHostCatalogue(catalogue) };
  for (const [file, text] of Object.entries(outputs)) { mkdirSync(dirname(resolve(root, file)), { recursive: true }); writeFileSync(resolve(root, file), text); }
  console.info(`host-catalogue: ${catalogue.hosts.length} hosts, ${catalogue.sections.length} sections`);
  return catalogue;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) writeHostCatalogue();
