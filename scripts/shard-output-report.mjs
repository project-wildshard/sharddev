// P4 orchestration is deliberately separate from gen: no build -> gen -> build cycle.
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import * as v from 'valibot';
import {runtimeClosures} from '@wildshard/engine/scripts/shard-runtime-closure.mjs';
import {outputCensus,portHeadline,codeLines,shaderCodeLines} from '@wildshard/engine/scripts/shard-platform.mjs';
import {outputContent} from '@wildshard/engine/scripts/shard-output-content.mjs';
import {customSectionFailures} from '@wildshard/engine/scripts/shard-platform-sections.mjs';
import {createOutputReader} from '@wildshard/engine/scripts/shard-platform-output.mjs';
import {gridReady,m3Progress,planProgress,unknownGridReady,M2_GRID_PLOT_CELLS} from './shard-milestones.mjs';
import {decisionLegacyLines} from '@wildshard/engine/scripts/decision-legacy-lines.mjs';
import {runtimeReceiptPaths} from '@wildshard/engine/scripts/grid-runtime-evidence.mjs';
import {netLineReport,platformLineTotals,sourceLineDelta} from '@wildshard/engine/scripts/shard-net-lines.mjs';
import {productScriptMetrics,scriptReceiptPaths} from '@wildshard/engine/scripts/script-scenario-metrics.mjs';

const sourceBaseline=v.strictObject({since:v.string(),revision:v.string(),basis:v.literal('source'),customLines:v.record(v.string(),v.pipe(v.number(),v.integer(),v.minValue(0)))});
const baseline=v.array(v.strictObject({wave:v.string(),revision:v.string(),record:v.string(),customLines:v.record(v.string(),v.number()),platformLines:v.record(v.string(),v.number())}));

/** Caller holds the heavy build lane (or measures the gate's exact HEAD output).
 * Each closed shard is copied strictly; an unclosed shard never gets a percent.
 * `sourceProgress` keeps the admin's historical source ruler in one unit even
 * when some runtimes close. Output closure and canonical output credit do not change.
 * `reportOnly` isolates product failures without inventing ownership credit.
 * @param {string} root @param {{build?:boolean,sourceProgress?:boolean,products?:string,revision?:string|null,receipts?:readonly string[],scriptReceipts?:readonly string[],reportOnly?:boolean,buildProduct?:(args:string[])=>Promise<void>}} options */
export async function outputReport(root,{build=true,sourceProgress=false,products=resolve(root,'out'),revision=process.env.VERCEL_GIT_COMMIT_SHA??null,receipts=runtimeReceiptPaths(root),scriptReceipts=scriptReceiptPaths(root),reportOnly=false,buildProduct}={}) {
  const closure=runtimeClosures(root);
  /** @type {Record<string,string>} */
  const productFailures={};
  /** @param {string} slug @param {unknown} error */
  const failed=(slug,error)=>{productFailures[slug]=error instanceof Error?error.message:String(error);};
  if(build) {
    if(products!==resolve(root,'out'))throw new Error('Build reports publish only to out/');
    const {buildShardfiles}=await import('./build-shardfiles.mjs');
    // Preparation copies raw-closed runtimes strictly and emits
    // unclosed products without copies. All receive actual byte-validation evidence.
    await buildShardfiles(root,{strict:false,copyRuntime:'closed',reuse:true,...(reportOnly?{onFailure:failed}:{}),...(buildProduct===undefined?{}:{build:buildProduct})});
  }
  const sections={},contents={},reader=createOutputReader(root,products);
  for(const [slug,state] of Object.entries(closure)) {
    if(Object.hasOwn(productFailures,slug))continue;
    try {
      sections[slug]=reader.sections(slug);
      if(state.status==='closed')contents[slug]=outputContent(root,slug,products,reader);
    } catch(error) {if(!reportOnly)throw error;failed(slug,error);}
  }
  const measurementError=Object.keys(productFailures).length===0?null:`Cross-shard ownership unavailable: ${Object.entries(productFailures).map(([slug,error])=>`${slug}: ${error}`).join('; ')}`;
  // G294 needs every verified section inventory to count shared users. Partial
  // output never supplies zeros, stale users, or a newly granted percentage.
  const census=measurementError===null?outputCensus(root,products,reader):{measures:{},inventory:{},source:{}};
  const {measures,inventory,source}=census;
  // G496: data debt applies even before a shard's runtime closes. Its budget
  // findings are report-only here (G514): the ruler always measures.
  const dailyLines=sourceLineDelta(source,v.parse(sourceBaseline,JSON.parse(readFileSync(resolve(import.meta.dirname,'shard-line-baseline.json'),'utf8'))));
  const rows=Object.fromEntries(Object.entries(closure).map(([slug,state])=>{
    const failure=Object.hasOwn(productFailures,slug)?productFailures[slug]:undefined;
    if(measurementError!==null) {
      const ready=failure===undefined?gridReady(root,slug,products,{revision,receipts,reader}):unknownGridReady(failure);
      if(failure!==undefined){ready.verdict='fail';ready.criteria.productBuild={verdict:'fail',evidence:failure};ready.frameFloor={verdict:'unknown',evidence:failure};}
      return [slug,{...state,customPercent:null,port:null,m3:null,measurementError,
        legacyLines:decisionLegacyLines(root,slug)??null,linesRemovedSince12Z:dailyLines.shards[slug]??null,
        gridReady:ready,scriptMetrics:failure===undefined?productScriptMetrics(root,slug,products,scriptReceipts):{status:'unknown',scripts:[],scenarios:[]},
        ...(sections[slug]===undefined?{}:{customSections:sections[slug].customSections,customSectionBytes:sections[slug].customSectionBytes}),
        ...(contents[slug]===undefined?{}:{content:contents[slug]}),...(failure===undefined?{}:{productFailure:failure})}];
    }
    const ready=gridReady(root,slug,products,{revision,receipts,reader});
    const scriptMetrics=productScriptMetrics(root,slug,products,scriptReceipts);
    if(state.status==='unclosed') {
      const progress=source[slug];
      return [slug,{...state,customPercent:null,port:null,linesRemovedSince12Z:dailyLines.shards[slug]??null,gridReady:ready,scriptMetrics,m3:m3Progress(slug,progress),
        customSections:sections[slug].customSections,customSectionBytes:sections[slug].customSectionBytes,
        assemblyScriptLines:progress.assemblyScriptLines,assemblyScriptBudget:progress.assemblyScriptBudget,
        listedView:inventory[slug]?.listedView}];
    }
    if(!Object.hasOwn(measures,slug))throw new Error(`${slug}: closed runtime has no output measure`);
    const measured=measures[slug];
    const content=contents[slug],customPercent=measured.conversion.runtimeShare===null?null:100*measured.conversion.runtimeShare;
    return [slug,{...state,...measured,customPercent,content,linesRemovedSince12Z:dailyLines.shards[slug]??null,port:portHeadline(customPercent,content),gridReady:ready,scriptMetrics,
      m3:m3Progress(slug,sourceProgress?source[slug]:{basis:'output',customLines:measured.conversion.customRuntimeLines,legacyLines:measured.conversion.legacyLines})}];
  }));
  const current=Object.fromEntries(Object.entries(rows).flatMap(([slug,row])=>row.m3===null?[]:[[slug,{customLines:row.m3.customLines,basis:row.m3.basis}]]));
  const baselines=v.parse(baseline,JSON.parse(readFileSync(resolve(import.meta.dirname,'wave-line-baselines.json'),'utf8')));
  const platform=platformLineTotals(root,(text,path)=>path.endsWith('.glsl')?shaderCodeLines(text):codeLines(text,path));
  const plots=Object.fromEntries([...new Set(M2_GRID_PLOT_CELLS.map(cell=>cell.slug))].map(slug=>[slug,gridReady(root,slug,products,{revision,receipts})]));
  return {rows,measures,inventory,dailyLines,netLines:netLineReport(current,baselines,platform),progress:planProgress(rows,plots),sectionFailures:customSectionFailures(root,sections),productFailures,measurementError};
}
