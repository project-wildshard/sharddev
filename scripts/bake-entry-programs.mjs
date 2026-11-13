#!/usr/bin/env node
// DL10: record the GLSL programs a shard links from ENTER WORLD to control, in Playwright WebKit as the phone (iPhone 16
// Pro, phone tier, 2x), and write them as public/programs/<slug>.json. With Debug 'Early shader compile' on,
// the session links this list from the renderer step on, so WebKit's GPU process has compiled each source before the
// Shaders step asks for it. A stale list costs only wasted links: re-bake after a shader or material change.
//   node scripts/bake-entry-programs.mjs --base <served build URL> [--check] <slug>...
//   --check: write nothing; print how many of the build's entry programs the committed list already holds.
//   --inline (SA43): the page carries the candidate inline (`wildshard prepare`'s own preview of engine's preparation
//   client); it enters at `?skipintro` as `wildshard dev` does, with the page's service worker off (`sw=0`), so every read
//   reaches the recorder from the network.
// Run through scripts/browser-lane.sh.
import {webkit,devices} from 'playwright';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hideDeveloperOverlays} from '@wildshard/engine/scripts/debug-settings.mjs';
import {loadingCardIndex} from '@wildshard/engine/scripts/loading-benchmark/catalogue.mjs';
import {preparationSaveSeed} from './preparation-seed.mjs';

const args=process.argv.slice(2), flag=name=>{const at=args.indexOf(name);if(at===-1)return null;const [value]=args.splice(at,2).slice(1);return value;};
const base=flag('--base'), output=flag('--out'), wantedHeader=flag('--header'), title=flag('--title'), check=args.includes('--check'), inline=args.includes('--inline'), slugs=args.filter(arg=>!arg.startsWith('--'));
if(base===null||slugs.length===0)throw new Error('usage: bake-entry-programs.mjs --base <url> [--check] <slug>...');

/** Every program linked between the tap and control, in link order (the page's own WebGL2 calls, read in place). */
async function record(browser,slug){
  const before=await(await fetch(new URL('/version.json',base))).json(),epoch=before.saveEpoch??0;
  if(!Number.isSafeInteger(epoch)||epoch<0)throw new Error('Preview has an invalid save epoch');
  if(wantedHeader!==null){
    const flags=await(await fetch(new URL('/build-flags.json',base))).json();
    if(flags.devserver!==false)throw new Error('Preparation needs a production-renderer preview, with DEVSERVER off');
  }
  const context=await browser.newContext({...devices['iPhone 16 Pro']});
  try{
    // The served epoch owns this fresh diagnostic context. The installed SDK
    // may predate that epoch; never write fixtures through its old namespace.
    // A device that has played and answered the Name prompt (engine MP2.4), or PLAY never reaches SHARD SELECT.
    await context.addInitScript(({seed})=>{for(const [key,value] of Object.entries(seed))localStorage.setItem(key,value);},{seed:preparationSaveSeed(epoch)});
    await context.addInitScript(hideDeveloperOverlays);
    // in the page: each document's own shaderSource / attachShader / linkProgram calls, the sources of every linked pair
    await context.addInitScript(`(() => {
      const P = WebGL2RenderingContext.prototype, source = new WeakMap(), attached = new WeakMap();
      window.__entryPrograms = [];
      const shaderSource = P.shaderSource, attach = P.attachShader, link = P.linkProgram;
      P.shaderSource = function (shader, text) { source.set(shader, text); shaderSource.call(this, shader, text); };
      P.attachShader = function (program, shader) {
        const list = attached.get(program) ?? []; list.push(shader); attached.set(program, list); attach.call(this, program, shader);
      };
      P.linkProgram = function (program) {
        const shaders = attached.get(program) ?? [];
        const of = type => source.get(shaders.find(shader => this.getShaderParameter(shader, this.SHADER_TYPE) === type));
        const vs = of(this.VERTEX_SHADER), fs = of(this.FRAGMENT_SHADER);
        if (typeof vs === 'string' && typeof fs === 'string') window.__entryPrograms.push([vs, fs]);
        link.call(this, program);
      };
    })();`);
    const page=await context.newPage();page.setDefaultTimeout(30000);
    const reads=new Set(),headers=[],metadata=[],hashes=new Set();
    page.on('response',response=>{
      const url=new URL(response.url());reads.add(url.pathname);
      if(wantedHeader!==null&&url.pathname.endsWith('/shard.json'))headers.push(response.body().then(bytes=>createHash('sha256').update(bytes).digest('hex')));
      if(wantedHeader!==null&&/\/assets\/spawn\/[^/]+\.json$/u.test(url.pathname))metadata.push(response.json().then(manifest=>{
        for(const file of manifest.files??[])if(typeof file.hash==='string')hashes.add(file.hash);
      }));
    });
    if(inline){
      const entry=new URL(base);entry.searchParams.set('skipintro','');entry.searchParams.set('sw','0');
      await page.goto(entry.href,{waitUntil:'load'});
    }else{
      await page.goto(base,{waitUntil:'load'});
      await page.locator('.ws-main-select').click();
      const names=await page.locator('.ws-menu-card b').allTextContents();
      const matches=title===null?[]:names.flatMap((name,index)=>name.toLowerCase().includes(title.toLowerCase())?[index]:[]);
      if(matches.length>1)throw new Error(`Candidate card ambiguous: ${title}`);
      if(title!==null&&matches.length===0){
        // Grid-only products have no standalone picker card. Exercise the
        // existing one-shot arrival contract, as the full-catalogue boot proof.
        await context.addInitScript(({epoch,slug,title})=>{
          if(new URL(location.href).searchParams.get('chunk')!==slug)return;
          const prefix=epoch===0?'wildshard.save.v2.':`wildshard.save.v2@${epoch}.`;
          const data=JSON.stringify({slug,name:title,mode:'enter',at:Date.now()});
          sessionStorage.setItem(`${prefix}session`,JSON.stringify({keys:{titleArrival:{v:1,data},'travel.handoff':{v:1,data:{v:1,from:null,to:slug,mode:'enter',arrive:null,carry:[],at:Date.now()}}}}));
        },{epoch,slug,title});
        const arrival=new URL(base);arrival.searchParams.set('chunk',slug);
        await page.goto(arrival.href,{waitUntil:'load'});
      }else{
        await page.locator(`.ws-menu-dots i[data-i="${title===null?loadingCardIndex(names,slug):matches[0]}"]`).click();
        // ENTER WORLD opens a fresh document and a fresh measured link list.
        await page.locator('.ws-menu-play').click();
      }
    }
    await page.waitForFunction(()=>window.__wildshard?.world?.hud?.entered===true&&!document.querySelector('.ws-load'),undefined,{timeout:240000});
    const version=await(await page.request.get(new URL('/version.json',base).href)).json();
    const documentBuild=await page.evaluate(()=>globalThis.__WS_BUILD_ID__);
    const renderer=await page.evaluate(()=>globalThis.__WS_RENDERER_REVISION__);
    if(wantedHeader!==null&&(documentBuild!==String(version.build??'')||documentBuild!==String(before.build??'')||version.saveEpoch!==before.saveEpoch))throw new Error('Preview changed renderer documents during preparation');
    if(wantedHeader!==null&&(typeof renderer!=='string'||!/^[a-f0-9]{64}$/u.test(renderer)||renderer!==before.rendererRevision||renderer!==version.rendererRevision))throw new Error('Preview does not expose one matching engine renderer revision; build a D5 preparation preview');
    const admitted=await page.evaluate(()=>globalThis.__WS_SHARDFILE_VERDICTS__??[]);
    const direct=(await Promise.all(headers)).includes(wantedHeader),receipt=admitted.some(row=>row.indexHash===wantedHeader);
    if(wantedHeader!==null&&!direct&&!receipt)throw new Error('Preparation boot has no exact candidate header or built admission receipt');
    await Promise.all(metadata);
    return {build:String(documentBuild??version.build??''),renderer,pairs:await page.evaluate(()=>window.__entryPrograms),reads:[...reads],hashes:[...hashes]};
  }finally{await context.close();}
}

const browser=await webkit.launch({headless:true});
try{
  for(const slug of slugs){
    const {build,renderer,pairs,reads,hashes}=await record(browser,slug),file=output??`public/programs/${slug}.json`;
    if(check){
      const held=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;
      const text=at=>held.shaders[at].map(line=>held.lines[line]).join('\n');
      const known=new Set((held?.programs??[]).map(([v,f])=>`${text(v)}\0${text(f)}`));
      const hits=pairs.filter(([v,f])=>known.has(`${v}\0${f}`)).length;
      console.log(`${slug}: ${hits} / ${pairs.length} entry programs on ${build} are in ${file}${held?` (baked on ${held.build})`:' (none)'}`);
      continue;
    }
    // three's shaders share most lines (its chunks): one line table, each shader a list of line indices
    const lines=[],lineAt=new Map(),line=text=>{if(!lineAt.has(text)){lineAt.set(text,lines.length);lines.push(text);}return lineAt.get(text);};
    const shaders=[],at=new Map(),index=text=>{if(!at.has(text)){at.set(text,shaders.length);shaders.push(text.split('\n').map(line));}return at.get(text);};
    const seen=new Set(),programs=[];
    for(const [vs,fs] of pairs){const pair=[index(vs),index(fs)],key=pair.join(',');if(!seen.has(key)){seen.add(key);programs.push(pair);}}
    const list={version:2,build,lines,shaders,programs};
    writeFileSync(file,`${JSON.stringify(wantedHeader===null?list:{headerHash:wantedHeader,renderer,reads,hashes,programs:list})}\n`);
    console.log(`${slug}: ${programs.length} programs, ${shaders.length} shaders, ${lines.length} lines, ${(readFileSync(file).length/1048576).toFixed(2)} MB -> ${file} (${build})`);
  }
}finally{await browser.close();}
