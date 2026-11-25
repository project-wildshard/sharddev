// FAST-RELEASE FR-A13 (meta docs/plans/FAST-RELEASE-PLAN.md): the phone WebKit recorder waited 240 s for the world to
// enter and then died with `page.waitForFunction: Timeout 240000ms exceeded` and an empty log, 11% of shard publishes
// (11-16 to 11-23). A healthy entry takes about 60 s; the reds were a page that had already failed (the engine's error
// card, an uncaught throw such as v0.1.84's "no weapon declared" on Driftwood) or stopped moving. This waits the same
// 240 s at most, but stops as soon as the engine shows its error card or the page crashes, and every refusal names
// what the page was waiting on: the loading card's line, the page's errors and failed requests.

/** What the page shows now: entered, the engine's error card, and the loading card's line.
 * @returns {{entered:boolean,error:string|null,loading:string|null}} */
export function entryState(){
  const text=(/** @type {Element|null} */el)=>el?.textContent?.replace(/\s+/gu,' ').trim().slice(0,200)??null;
  // @ts-ignore the engine's own debug handle
  const entered=window.__wildshard?.world?.hud?.entered===true&&!document.querySelector('.ws-load');
  return {entered,error:text(document.querySelector('.ws-load-error')),
    loading:text(document.querySelector('.ws-load [data-el="line"]'))??text(document.querySelector('.ws-load'))};
}

/** Collects what a refusal must name. @param {import('playwright').Page} page */
export function watchPage(page){
  /** @type {string[]} */ const errors=[];/** @type {string[]} */ const failed=[];let crashed=false;
  const keep=(/** @type {string[]} */list,/** @type {string} */line)=>{list.push(line.slice(0,300));if(list.length>8)list.shift();};
  page.on('pageerror',error=>keep(errors,`uncaught ${error.message}`));
  page.on('console',message=>{if(message.type()==='error')keep(errors,`console ${message.text()}`);});
  page.on('requestfailed',request=>keep(failed,`${request.failure()?.errorText??'failed'} ${new URL(request.url()).pathname}`));
  page.on('crash',()=>{crashed=true;});
  return {errors,failed,crashed:()=>crashed};
}

/** Waits for the world to enter, or throws naming what the page waited on.
 * @param {{evaluate:(fn:typeof entryState)=>Promise<ReturnType<typeof entryState>>}} page
 * @param {ReturnType<typeof watchPage>} seen
 * @param {{timeout?:number,poll?:number,now?:()=>number,sleep?:(ms:number)=>Promise<void>}} [options] */
export async function waitForEntry(page,seen,{timeout=240_000,poll=1000,now=Date.now,sleep=ms=>new Promise(done=>setTimeout(done,ms))}={}){
  const start=now();
  /** @type {ReturnType<typeof entryState>|null} */ let state=null;
  /** @param {string} why */
  const refuse=why=>{
    const lines=[`Phone WebKit entry ${why} after ${Math.round((now()-start)/1000)} s`,
      `  loading card: ${state?.loading??'(none)'}`,
      ...(state?.error?[`  engine error card: ${state.error}`]:[]),
      ...seen.errors.map(line=>`  page ${line}`),
      ...seen.failed.map(line=>`  request ${line}`)];
    return new Error(lines.join('\n'));
  };
  for(;;){
    if(seen.crashed())throw refuse('stopped: the page crashed');
    try{state=await page.evaluate(entryState);}catch(error){
      if(seen.crashed())throw refuse('stopped: the page crashed');
      throw refuse(`stopped: the page went away (${error instanceof Error?error.message:String(error)})`);
    }
    if(state.entered)return state;
    if(state.error!==null)throw refuse('stopped: the engine showed its error card');
    if(now()-start>=timeout)throw refuse(`timed out (${Math.round(timeout/1000)} s)`);
    await sleep(poll);
  }
}
