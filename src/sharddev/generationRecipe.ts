import ts from '@typescript/typescript6';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';

/** Bind each cached callback to its lexical source dependencies after bundling.
 * The checker resolves bindings, so an unrelated imported constant/function is
 * absent from the recipe. Captured declarations recursively include their own
 * helpers, constants, default arguments and module initialization effects.
 * Explicit byte inputs and the compiler/host are keyed by the cache itself. */
export function generationRecipes(code: string): string {
  const file = ts.createSourceFile('generation.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const host: ts.CompilerHost = {
    getSourceFile: name => name === file.fileName ? file : undefined,
    getDefaultLibFileName: () => '', writeFile: () => undefined,
    getCurrentDirectory: () => '', getDirectories: () => [],
    fileExists: name => name === file.fileName,
    readFile: name => name === file.fileName ? code : undefined,
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const checker = ts.createProgram([file.fileName], { allowJs: true, noResolve: true, noLib: true }, host).getTypeChecker();
  const effects = file.statements.filter(statement => ts.isExpressionStatement(statement)
    || ts.isIfStatement(statement) || ts.isForStatement(statement) || ts.isForOfStatement(statement)
    || ts.isWhileStatement(statement) || ts.isTryStatement(statement));
  const edits: { at: number; value: string }[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'cached' && node.arguments.length === 2) {
      const callback = node.arguments[1];
      if (callback === undefined) throw new Error('Generation callback missing');
      const seen = new Set<ts.Node>();
      const sources = new Set<string>();
      const collect = (dependency: ts.Node): void => {
        if (seen.has(dependency)) return;
        seen.add(dependency);
        if (ts.isIdentifier(dependency)) {
          const declarations = checker.getSymbolAtLocation(dependency)?.declarations ?? [];
          for (const declaration of declarations) {
            if (declaration.getSourceFile() !== file || seen.has(declaration)) continue;
            // Parameters have no runtime value in source. Their defaults/types
            // still enter the closure, as do local values computed from them.
            sources.add(declaration.getText(file));
            collect(declaration);
          }
        }
        ts.forEachChild(dependency, collect);
      };
      sources.add(callback.getText(file));
      collect(callback);
      for (const effect of effects) { sources.add(effect.getText(file)); collect(effect); }
      const receiver = node.expression.expression;
      const context = ts.isIdentifier(receiver) ? checker.getSymbolAtLocation(receiver) : undefined;
      // Initializers alone are insufficient: a captured local may be assigned
      // later, or an object may be filled by a helper before cached() is called.
      // Follow writes and calls using those bindings to a fixed point as well.
      let previousSize = -1;
      while (previousSize !== seen.size) {
        previousSize = seen.size;
        const refers = (target: ts.Node): boolean => {
          if (ts.isIdentifier(target)) {
            const symbol = checker.getSymbolAtLocation(target);
            if (symbol !== context && symbol?.declarations?.some(declaration => seen.has(declaration))) return true;
          }
          return ts.forEachChild(target, child => refers(child) || undefined) === true;
        };
        const mutations = (target: ts.Node): void => {
          let relevant = false;
          if (ts.isBinaryExpression(target) && target.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
            && target.operatorToken.kind <= ts.SyntaxKind.LastAssignment) relevant = refers(target.left);
          if (ts.isDeleteExpression(target)) relevant = refers(target.expression);
          if (ts.isPostfixUnaryExpression(target)
            || ts.isPrefixUnaryExpression(target) && (target.operator === ts.SyntaxKind.PlusPlusToken || target.operator === ts.SyntaxKind.MinusMinusToken)) relevant = refers(target.operand);
          if (ts.isCallExpression(target) && !(ts.isPropertyAccessExpression(target.expression) && target.expression.name.text === 'cached')) relevant = refers(target);
          if (relevant && !seen.has(target)) { sources.add(target.getText(file)); collect(target); }
          ts.forEachChild(target, mutations);
        };
        mutations(file);
      }
      // A higher-order caller can pass a closure whose runtime captures are
      // unavailable here. Keep the full program key in that case; guessing a
      // function's identity from toString() would silently reuse stale bytes.
      const dynamic = [...seen].some(dependency => ts.isParameter(dependency)
        && !seen.has(dependency.parent)
        && checker.getSymbolAtLocation(dependency.name) !== context);
      if (dynamic) { ts.forEachChild(node, walk); return; }
      const recipe = hashImmutableBytes(new TextEncoder().encode(JSON.stringify([...sources].sort())));
      edits.push({ at: callback.end, value: `, ${JSON.stringify(recipe)}` });
    }
    ts.forEachChild(node, walk);
  };
  walk(file);
  let output = code;
  for (const edit of edits.sort((a, b) => b.at - a.at)) output = output.slice(0, edit.at) + edit.value + output.slice(edit.at);
  return output;
}
