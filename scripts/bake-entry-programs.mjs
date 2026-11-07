#!/usr/bin/env node
// DL10: record the GLSL programs a shard links from ENTER WORLD to control, in Playwright WebKit as the phone (iPhone 16
// Pro, phone tier, 2x), and write them as public/programs/<slug>.json. With Debug 'Early shader compile' on,
// the session links this list from the renderer step on, so WebKit's GPU process has compiled each source before the
// Shaders step asks for it. A stale list costs only wasted links: re-bake after a shader or material change.
//   node scripts/bake-entry-programs.mjs --base <served build URL> [--check] <slug>...
//   --check: write nothing; print how many of the build's entry programs the committed list already holds.
// Run through scripts/browser-lane.sh.
import {webkit,devices} from 'playwright';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {developerSettings,saveFixture,hideDeveloperOverlays} from '@wildshard/engine/scripts/debug-settings.mjs';
import {loadingCardIndex} from '@wildshard/engine/scripts/loading-benchmark/catalogue.mjs';

const args=process.argv.slice(2), flag=name=>{const at=args.indexOf(name);if(at===-1)return null;const [value]=args.splice(at,2).slice(1);return value;};
const base=flag('--base'), check=args.includes('--check'), slugs=args.filter(arg=>!arg.startsWith('--'));
if(base===null||slugs.length===0)throw new Error('usage: bake-entry-programs.mjs --base <url> [--check] <slug>...');

/** Every program linked between the tap and control, in link order (the page's own WebGL2 calls, read in place). */
async function record(browser,slug){
  const context=await browser.newContext({...devices['iPhone 16 Pro']});
  try{
    await developerSettings(context,{tier:'phone',volume:0,time:'midday',weather:'clear'});
    await saveFixture(context,{scope:'global',key:'gfx',data:{dpr:'2',aa:'auto'}});
    await saveFixture(context,{scope:'device',key:'debug.global.holdLoading',data:'off'});
    await saveFixture(context,{scope:'device',key:'debug.earlyPrograms',data:'off'}); // the level's own links only
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
    await page.goto(base,{waitUntil:'load'});
    await page.locator('.ws-main-select').click();
    const names=await page.locator('.ws-menu-card b').allTextContents();
    await page.locator(`.ws-menu-dots i[data-i="${loadingCardIndex(names,slug)}"]`).click();
    // ENTER WORLD opens the level in a fresh document: its list starts empty there
    await page.locator('.ws-menu-play').click();
    await page.waitForFunction(()=>window.__wildshard?.world?.hud?.entered===true&&!document.querySelector('.ws-load'),undefined,{timeout:240000});
    const version=await(await page.request.get(new URL('/version.json',base).href)).json();
    return {build:String(version.build??''),pairs:await page.evaluate(()=>window.__entryPrograms)};
  }finally{await context.close();}
}

const browser=await webkit.launch({headless:true});
try{
  for(const slug of slugs){
    const {build,pairs}=await record(browser,slug),file=`public/programs/${slug}.json`;
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
    writeFileSync(file,`${JSON.stringify({version:2,build,lines,shaders,programs})}\n`);
    console.log(`${slug}: ${programs.length} programs, ${shaders.length} shaders, ${lines.length} lines, ${(readFileSync(file).length/1048576).toFixed(2)} MB -> ${file} (${build})`);
  }
}finally{await browser.close();}
