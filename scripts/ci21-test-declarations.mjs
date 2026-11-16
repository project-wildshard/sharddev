import { readFileSync } from 'node:fs';
import ts from '@typescript/typescript6';

/** Find real test declarations, including each/template titles, without reading comments as tests. */
function testRoot(expression) {
  if (ts.isIdentifier(expression)) return ['test', 'it', 'describe'].includes(expression.text) ? expression.text : null;
  if (ts.isPropertyAccessExpression(expression)) {
    const root = testRoot(expression.expression);
    if (root !== null && expression.name.text !== 'each') throw new Error('CI21 ports must run in the default blocking suite');
    return root;
  }
  return ts.isCallExpression(expression) ? testRoot(expression.expression) : null;
}
export function titles(path) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true), found = [];
  const imported = new Set();
  for (const statement of source.statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === 'vitest') {
    const bindings = statement.importClause?.namedBindings;
    if (bindings !== undefined && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
      const original = element.propertyName?.text ?? element.name.text;
      if (['test', 'it', 'describe'].includes(original)) {
        if (original !== element.name.text) throw new Error(`CI21 test aliases need explicit admission: ${path}`);
        imported.add(original);
      }
    }
  }
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined && testRoot(node.initializer) !== null) throw new Error(`CI21 test aliases need explicit admission: ${path}`);
    if (ts.isCallExpression(node) && testRoot(node.expression) !== null) {
      const root = testRoot(node.expression);
      if (root === 'describe' || !imported.has(root)) throw new Error(`CI21 cases must be direct named Vitest imports: ${path}`);
      const title = node.arguments[0];
      if (title !== undefined && (ts.isStringLiteralLike(title) || ts.isTemplateExpression(title))) {
        if (![node.arguments[1], node.arguments[2]].some(body => body !== undefined && (ts.isArrowFunction(body) || ts.isFunctionExpression(body)))) throw new Error(`CI21 case has no executable body: ${path}`);
      }
      if (title !== undefined && ts.isStringLiteralLike(title)) found.push(title.text);
      else if (title !== undefined && ts.isTemplateExpression(title)) found.push(title.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
