// SF45: discover public schema bindings from the SDK's defining modules, without invoking author/build functions.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from '@typescript/typescript6';
import { schemaInventory } from './schema-reference.mjs';
import { layerFolder } from '@wildshard/engine/scripts/format-package.mjs';

/** Read public schema metadata without invoking author/build functions.
 * @param {string} root @param {"sharddev"|"format"} layer */
async function packageSchemas(root, layer) {
  const manifest = JSON.parse(readFileSync(resolve(root, layerFolder(layer), 'package.json'), 'utf8')), rows = [];
  for (const [module, target] of Object.entries(manifest.exports).sort(([a], [b]) => a.localeCompare(b))) {
    if (module.endsWith('.json')) continue;
    if (typeof target !== 'string' || !target.startsWith('./') || !/\.m?ts$|\.mjs$/u.test(target)) throw new Error(`Unsupported ${layer} defining export ${module}`);
    const file = resolve(root, layerFolder(layer), target), text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const names = source.statements.flatMap(statement => ts.isVariableStatement(statement)
      && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ? statement.declarationList.declarations.flatMap(declaration => ts.isIdentifier(declaration.name) && declaration.name.text.endsWith('Schema') ? [declaration.name.text] : []) : []).sort();
    if (names.length === 0) continue;
    const bindings = await import(pathToFileURL(file).href);
    for (const name of names) rows.push(...schemaInventory(bindings[name], `$${layer}[${JSON.stringify(module)}].${name}`));
  }
  return rows;
}

/** Every public SDK schema is inventoried from its defining metadata. @param {string} root */
export async function sdkSchemaInventory(root) { return packageSchemas(root, 'sharddev'); }
/** Every extracted format schema joins SF45 automatically. @param {string} root */
export async function formatSchemaInventory(root) { return packageSchemas(root, 'format'); }
