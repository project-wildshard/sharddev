import {expect,test} from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- Pure policy controls run in a bounded child without browsers.
import {execFileSync} from 'node:child_process';
import {unadmittedBrowserImports} from '../scripts/browser-imports.mjs';

test('all executable SDK Playwright imports pass through machine admission',()=>{expect(unadmittedBrowserImports()).toEqual([]);});
test('portable machine policy keeps all 12 refusal and private-file controls',()=>{
 const output=execFileSync(process.execPath,['--test','--test-reporter=tap','scripts/browser-machine-loader-proof.mjs'],{encoding:'utf8',timeout:10000});
 expect(output).toContain('# pass 12');expect(output).toContain('# fail 0');
});
