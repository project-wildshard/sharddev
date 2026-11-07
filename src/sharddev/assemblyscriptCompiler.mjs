/** Load only the pinned external compiler; its guest globals must not enter host types.
 * The static string expression is folded by the bundler and checked by the authoring audit.
 * @returns {Promise<unknown>} */
export function loadAssemblyScriptCompiler() {
  // oxlint-disable-next-line eslint/no-useless-concat -- A direct literal loads AssemblyScript's guest globals into the host type program; bundling and the audit fold these exact literals.
  return import('assemblyscript/dist/' + 'asc.js');
}

/** Load the pinned parser without leaking guest globals into host declarations.
 * @returns {Promise<unknown>} */
export function loadAssemblyScriptParser() {
  // oxlint-disable-next-line eslint/no-useless-concat -- Keep guest declarations outside the host type program.
  return import('assemblyscript/dist/' + 'assemblyscript.js');
}
