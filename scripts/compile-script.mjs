/** Repository compatibility wrapper for the SDK's pinned portable compiler. */
import { compileScript as compile, instrumentScript as instrument } from '@wildshard/sdk/compileScript';

/** @param {Uint8Array} bytes */
export function instrumentScript(bytes) { return instrument(bytes); }
/** Compile and meter ABI-v0 source with the same SDK implementation used by outside authors.
 * @param {string} source @param {{maximumPages?:number,sources?:Readonly<Record<string,string>>}} [options] */
export function compileScript(source, options = {}) { return compile(source, options); }
