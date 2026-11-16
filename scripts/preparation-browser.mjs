// MU3/F30: test the installed phone browser before fetching a large client.
// WebKit uses its own defaults: Chromium's Metal/keychain flags do not apply.
import {webkit} from 'playwright';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const version=require('playwright/package.json').version;
export const PREPARATION_LAUNCH_TIMEOUT=20000;

/** A bounded, headless WebKit launch. Playwright owns timeout/process cleanup. */
export async function launchPreparationBrowser(){
  try{return await webkit.launch({headless:true,timeout:PREPARATION_LAUNCH_TIMEOUT});}
  catch(error){
    const reason=error instanceof Error&&error.name==='TimeoutError'?'did not start within 20 seconds (up to 30 seconds more for process cleanup)':'could not start';
    throw new Error(`Phone WebKit ${reason} (Playwright ${version}). Run pnpm dlx playwright@${version} install webkit, then retry. If it still fails, run prepare on another macOS/Linux machine with working WebKit; --base also needs local WebKit. Candidate left as a draft.`);
  }
}

/** Pay first-launch cost and report the actual browser before any client download. */
export async function checkPreparationBrowser(){
  const at=Date.now(),browser=await launchPreparationBrowser();
  try{console.error(`wildshard prepare: headless WebKit ${browser.version()} ready (${Date.now()-at} ms; Playwright ${version})`);}
  finally{await browser.close();}
}
