// SF45: inspect trusted schema metadata only; never parse data or execute defaults/predicates.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = value => Array.isArray(value) ? value.map(sorted) : record(value)
  ? Object.fromEntries(Object.keys(value).sort(order).map(key => [key, sorted(value[key])])) : value;
const describe = value => value instanceof RegExp ? value.toString() : typeof value === 'function' ? '[function; not executed]'
  : value === undefined ? 'undefined' : JSON.stringify(sorted(value));
const schemas = new Set(['array', 'boolean', 'custom', 'exact_optional', 'intersect', 'lazy', 'literal', 'loose_object', 'never', 'null', 'nullable', 'number', 'object', 'object_with_rest', 'optional', 'picklist', 'record', 'strict_object', 'strict_tuple', 'string', 'tuple', 'tuple_with_rest', 'union', 'unknown', 'variant']);
const actions = new Set(['check', 'finite', 'integer', 'length', 'max_length', 'max_entries', 'max_value', 'min_entries', 'min_length', 'min_value', 'multiple_of', 'raw_check', 'raw_transform', 'transform', 'regex', 'safe_integer']);

/** Extract every declared path, preserving alternative branches and refusing unknown metadata. */
export function schemaInventory(schema, root = '$') {
  const rows = [], stack = new Set();
  function visit(input, path, wrappers = [], inherited = []) {
    if (!record(input) || input.kind !== 'schema' || !schemas.has(input.type)) throw new Error(`Unsupported schema at ${path}: ${input?.type}`);
    if (stack.has(input)) throw new Error(`Recursive schema at ${path} requires an explicit reference representation`);
    if (stack.size >= 64 || rows.length >= 100_000) throw new Error(`Schema reference capacity at ${path}`);
    stack.add(input);
    try {
      const checks = [...inherited];
      const pipelines = new Set();
      function unwrap(value) {
        if (!Array.isArray(value.pipe)) return value;
        if (pipelines.has(value) || pipelines.size >= 64) throw new Error(`Recursive schema pipeline at ${path}`);
        pipelines.add(value);
        let base = value;
        for (const part of value.pipe) {
          if (!record(part)) throw new Error(`Invalid pipeline at ${path}`);
          if (part.kind === 'schema') base = unwrap(part);
          else {
            if (!actions.has(part.type)) throw new Error(`Unsupported schema action at ${path}: ${part.type}`);
            checks.push([part.type, ...('requirement' in part ? [describe(part.requirement)] : []),
              ...(typeof part.message === 'string' ? [JSON.stringify(part.message)] : [])].join(' '));
          }
        }
        pipelines.delete(value);
        return base;
      }
      const base = unwrap(input);
      if (!schemas.has(base.type)) throw new Error(`Unsupported schema at ${path}: ${base.type}`);
      if (['optional', 'exact_optional', 'nullable'].includes(base.type)) {
        const wrapper = { kind: base.type, default: describe(base.default) };
        visit(base.wrapped, path, [...wrappers, wrapper], checks);
        return;
      }
      const row = { path, type: base.type, wrappers, constraints: checks };
      if (base.type === 'literal') row.literal = describe(base.literal);
      if (base.type === 'picklist') row.values = base.options.map(describe);
      if (base.type === 'variant') row.discriminator = base.key;
      if (base.type === 'custom') row.constraints.push('custom predicate; not executed');
      if (base.type === 'lazy') row.constraints.push('lazy schema factory; not executed');
      if (base.type === 'loose_object') row.constraints.push('unknown fields are preserved');
      if (base.type === 'intersect') row.constraints.push('every intersection branch must pass');
      rows.push(row);
      if (base.type === 'object' || base.type === 'strict_object' || base.type === 'loose_object' || base.type === 'object_with_rest') {
        if (!record(base.entries)) throw new Error(`Missing object fields at ${path}`);
        for (const key of Object.keys(base.entries).sort(order)) visit(base.entries[key], `${path}.${key}`);
        if (base.type === 'object_with_rest') visit(base.rest, `${path}{rest}`);
      } else if (base.type === 'array') visit(base.item, `${path}[]`);
      else if (base.type === 'record') { visit(base.key, `${path}{key}`); visit(base.value, `${path}{value}`); }
      else if (base.type === 'tuple' || base.type === 'strict_tuple' || base.type === 'tuple_with_rest') {
        base.items.forEach((item, index) => visit(item, `${path}[${index}]`));
        if (base.type === 'tuple_with_rest') visit(base.rest, `${path}[rest]`);
      }
      else if (base.type === 'union' || base.type === 'variant') base.options.forEach((option, index) => visit(option, `${path}<${index}>`));
      else if (base.type === 'intersect') base.options.forEach((option, index) => visit(option, `${path}&<${index}>`));
    } finally { stack.delete(input); }
  }
  visit(schema, root);
  return rows;
}

/** Render numeric Wasm signatures from the exact admitted import/export tables. */
export function abiInventory(imports, exports) {
  const names = new Map([[0x7f, 'i32'], [0x7e, 'i64'], [0x7d, 'f32'], [0x7c, 'f64'], [0, 'void']]);
  return [['import', imports], ['export', exports]].flatMap(([kind, table]) => Object.keys(table).sort(order).map(name => {
    const signature = table[name];
    if (!Array.isArray(signature) || signature.some(value => !names.has(value)) || signature.slice(0, -1).includes(0)) throw new Error(`Invalid ABI signature: ${kind}.${name}`);
    return { kind, name, parameters: signature.slice(0, -1).map(value => names.get(value)), result: names.get(signature.at(-1) ?? 0) };
  }));
}

const cell = value => String(value).replaceAll('|', '&#124;').replaceAll('\n', '<br>');
/** Compare the actual documented keys to schema/ABI metadata, including missing, duplicate and obsolete entries. */
export function referenceCoverage(inventory, abi, document) {
  const fieldKeys = [], callKeys = [];
  for (const line of document.split('\n')) {
    const columns = line.split('|').slice(1, -1).map(value => value.trim());
    if (columns[0]?.startsWith('$')) fieldKeys.push(columns[0]);
    else if (columns[0] === 'import' || columns[0] === 'export') callKeys.push(`${columns[0]}.${columns[1]}`);
  }
  function coverage(expected, actual) {
    if (new Set(expected).size !== expected.length) throw new Error('Duplicate reference inventory keys');
    const counts = new Map();
    for (const key of actual) counts.set(key, (counts.get(key) ?? 0) + 1);
    const keys = new Set(expected);
    return { total: expected.length, documented: expected.filter(key => counts.has(key)).length,
      missing: expected.filter(key => !counts.has(key)), extra: [...counts.keys()].filter(key => !keys.has(key)),
      duplicates: [...counts].filter(([, count]) => count > 1).map(([key]) => key) };
  }
  return { fields: coverage(inventory.map(row => cell(row.path)), fieldKeys), abi: coverage(abi.map(row => `${row.kind}.${cell(row.name)}`), callKeys) };
}
/** Refuse incomplete documentation before the complete generated-byte comparison checks bounds and signatures. */
export function assertReferenceCoverage(inventory, abi, document) {
  const result = referenceCoverage(inventory, abi, document), errors = [];
  for (const [kind, value] of Object.entries(result)) for (const category of ['missing', 'extra', 'duplicates']) {
    if (value[category].length > 0) errors.push(`${kind} ${category}: ${value[category].join(', ')}`);
  }
  if (errors.length > 0) throw new Error(`Schema documentation coverage: ${errors.join('; ')}`);
  return result;
}
/** Deterministic generated appendix; semantic checks are named, never represented as proven bounds. */
export function renderReference(inventory, abi, contract) {
  const lines = ['# Shardfile schema and script ABI reference', '', '<!-- Generated by scripts/docs/gen-shardfile-reference.mjs; serialized pusher only. -->', '',
    'The source of truth is `shardSchema.ts` in `@wildshard/format`, the schema exports in `src/sdk/package.json`, and `scriptAbi.ts` in `@wildshard/format`. This appendix reads their actual metadata. It does not execute predicates, lazy factories or migrations.', '',
    'Paths start at `$` for the compiled shardfile; `$sharddev["./module"].Schema` names a public SDK schema, including build-only input. `[]` is an array member, `[n]` a tuple slot, `{key}` / `{value}` a record, and `<n>` a union branch. Optionality and nullability apply at the listed path. Branch-local required fields are conditional on selecting that branch. Function defaults and custom checks are explicitly opaque; the author guide explains their semantics. This is metadata coverage, not an assertion that custom predicate internals have a Valibot shape.', '',
    `Coverage: ${inventory.length}/${inventory.length} schema paths; ${abi.length}/${abi.length} ABI calls. Missing, duplicate, obsolete or stale entries fail the reference check.`, '',
    '## Fields', '', '| Path | Type | Presence / default | Constraints |', '| --- | --- | --- | --- |'];
  for (const row of inventory) {
    const type = [row.type, ...(row.literal === undefined ? [] : [row.literal]), ...(row.values === undefined ? [] : [row.values.join(', ')]), ...(row.discriminator === undefined ? [] : [`by ${row.discriminator}`])].join(' ');
    const presence = row.wrappers.length === 0 ? 'required' : row.wrappers.map(w => `${w.kind}; default ${w.default}`).join('; ');
    lines.push(`| ${cell(row.path)} | ${cell(type)} | ${cell(presence)} | ${cell(row.constraints.join('; '))} |`);
  }
  lines.push('', '## Script ABI', '', 'Signatures list Wasm value types; `void` has no result. The final numeric entry in each source signature is the result; an empty export signature is void.', '', '| Direction | Name | Parameters | Result |', '| --- | --- | --- | --- |');
  for (const row of abi) lines.push(`| ${row.kind} | ${cell(row.name)} | ${row.parameters.join(', ') || '—'} | ${row.result} |`);
  lines.push('', '## ABI toolchain and limits', '', '| Name | Value |', '| --- | --- |');
  for (const key of Object.keys(contract).sort(order)) lines.push(`| ${cell(key)} | ${cell(describe(contract[key]))} |`);
  return `${lines.join('\n')}\n`;
}
