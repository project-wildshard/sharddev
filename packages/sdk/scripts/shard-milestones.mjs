// G458: outcome progress and evidence-bound grid readiness, never task counts.
import { representativeProduct } from '@wildshard/engine/scripts/shard-outputs.mjs';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {outputFormat,gridReadinessFormat} from '@wildshard/engine/scripts/shard-platform-format.mjs';
import {runtimeGridEvidence} from '@wildshard/engine/scripts/grid-runtime-evidence.mjs';
import catalogue from '@wildshard/engine/game/grid/singleplayer.json' with {type:'json'};
import plotOutputs from '../src/shards/open-plots/outputs.json' with {type:'json'};
import {formatSource} from '@wildshard/engine/scripts/format-package.mjs';

export const MILESTONE_SHARDS=['far-reach','sunscar-dunes','pine-hollow','driftwood-isle','nalati-grasslands','nine-dragon-stack'];
// M2 covers the complete authored grid, shared by public and Developer. M3
// retains its six frozen denominators. Plot products occupy cells separately.
/** @type {Map<string,{slug:string,instance:string}>} */
const gridCells=new Map();
for(const cell of catalogue.grid.cells)gridCells.set(cell.cell.join(','),cell);
const plotSlugs=new Set(plotOutputs.outputs.map(row=>row.slug));
export const M2_GRID_SHARDS=[...new Set([...gridCells.values()].filter(cell=>!plotSlugs.has(cell.slug)).map(cell=>cell.slug))].sort();
export const M2_GRID_PLOT_CELLS=[...gridCells.values()].filter(cell=>plotSlugs.has(cell.slug));
export const M2_GRID_PLOTS=M2_GRID_PLOT_CELLS.length;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
/** @param {Record<string,{verdict:'pass'|'fail'|'unknown',evidence:string}>} criteria */
export function readinessVerdict(criteria) {
  const values=Object.values(criteria);
  return values.some(row=>row.verdict==='fail')?'fail':values.length>0&&values.every(row=>row.verdict==='pass')?'pass':'unknown';
}
export function unknownGridReady(evidence='No bound output validation evidence') {
  /** @type {Record<string,import('./shard-milestones.mjs').Criterion>} */
  const criteria=Object.fromEntries(['bakedTiles','edgeProfile','fourEntryways','memory','hudAccent','oneFrameLooks'].map(name=>[name,{verdict:'unknown',evidence}]));
  return {verdict:readinessVerdict(criteria),criteria,frameFloor:{verdict:'unknown',evidence:'No qualified exact-SHA frame-floor receipt'}};
}
/** Only byte-bound emitted metadata and the writer's matching receipt supply
 * evidence. Missing or stale artifacts stay unknown; source declarations and
 * a successful standalone boot never stand in for grid readiness.
 * @param {string} root @param {string} slug @param {string} products
 * @param {{revision?:string|null,receipts?:readonly string[],reader?:import('@wildshard/engine/scripts/shard-platform-output.mjs').OutputReader}} options */
export function gridReady(root,slug,products,{revision=null,receipts=[],reader}={}) {
  const {criteria,frameFloor:unmeasuredFloor}=unknownGridReady();
  let frameFloor=unmeasuredFloor;
  /** @type {import('./shard-milestones.mjs').GridReady['binding']} */
  let binding;
  const result=()=>({verdict:readinessVerdict(criteria),criteria,frameFloor,...(binding===undefined?{}:{binding})});
  const directory=resolve(products,representativeProduct(root,slug)),indexPath=resolve(directory,'shard.json'),receiptPath=resolve(directory,'validation.json');
  if(!existsSync(indexPath)||!existsSync(receiptPath))return result();
  try {
    const bytes=readFileSync(indexPath),index=outputFormat.parseOutputIndex(JSON.parse(bytes.toString('utf8'))),receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
    if(receipt.indexHash!==hash(bytes)||receipt.revision!==index.build.validator||receipt.sourceHash!==index.build.sourceHash)return result();
    binding={indexHash:hash(bytes),validationHash:hash(readFileSync(receiptPath)),sourceHash:index.build.sourceHash,validator:index.build.validator,revision};
    const sections=new Map();
    for(const row of index.sections) {
      const payload=readFileSync(resolve(directory,row.path));
      if(payload.length!==row.bytes||hash(payload)!==row.hash)return result();
      sections.set(row.name,JSON.parse(payload.toString('utf8')));
    }
    if(receipt.gridReady===undefined)return result();
    // The writer emits this only after actual asset admission, including the full
    // 8x15m terrain/mesh/prop/collider/water checks, not just the metadata schema.
    const source=reader===undefined?outputFormat.assembleOutputShardfile(index,sections):reader.source(slug);
    const structural=gridReadinessFormat.parseGridStructuralEvidence(receipt.gridReady);
    if(JSON.stringify(structural)!==JSON.stringify(gridReadinessFormat.structuralGridEvidence(source)))throw new Error('Grid evidence differs from emitted sections');
    for(const [name,criterion] of Object.entries(structural.criteria))criteria[name]={...criterion,
      evidence:`index sha256:${hash(bytes)}, validation sha256:${hash(readFileSync(receiptPath))}: ${criterion.evidence}`};
    const caps=JSON.parse(readFileSync(formatSource(root,'memoryGates.json'),'utf8'));
    criteria.memory={verdict:'unknown',evidence:'No latched memory pass or qualified current-source reading; declared costs alone are not readings'};
    criteria.oneFrameLooks={verdict:'unknown',evidence:'No latched look/travel pass or qualified current-source phone grid witness'};
    if([caps.explorerMB,caps.loadingMB].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0)) {
      const {frameFloor:measuredFloor,...readiness}=runtimeGridEvidence(root,slug,revision,receipts,caps);
      frameFloor=measuredFloor??unmeasuredFloor;Object.assign(criteria,readiness);
    }
  } catch(error) {
    criteria.validation={verdict:'fail',evidence:`Output validation refused: ${error instanceof Error?error.message:String(error)}`};
  }
  return result();
}

/** @param {string} _slug @param {{basis:'source'|'output',customLines:number,legacyLines:number|null}} input */
export function m3Progress(_slug,input) {
  if(input.legacyLines===null)return null;
  const target=0;
  const mustGo=input.legacyLines,cut=Math.max(0,input.legacyLines-input.customLines);
  return {...input,target,mustGo,cut,fraction:cut/mustGo};
}
/** @param {Record<string,{m3:ReturnType<typeof m3Progress>,gridReady:import('./shard-milestones.mjs').GridReady}|undefined>} rows
 * @param {Record<string,import('./shard-milestones.mjs').GridReady>} [plots] */
export function planProgress(rows,plots={}) {
  const ports=MILESTONE_SHARDS.map(slug=>rows[slug]),measured=ports.flatMap(row=>row?.m3??[]);
  const mustGo=measured.reduce((sum,row)=>sum+row.mustGo,0),cut=measured.reduce((sum,row)=>sum+row.cut,0);
  const m3=measured.length===6&&mustGo>0?cut/mustGo:null;
  const grid=M2_GRID_SHARDS.map(slug=>rows[slug]),total=grid.length;
  const ready=grid.filter(row=>row?.gridReady.verdict==='pass').length;
  const unknown=grid.filter(row=>row===undefined||row.gridReady.verdict==='unknown').length;
  const plotReady=M2_GRID_PLOT_CELLS.filter(cell=>plots[cell.slug]?.verdict==='pass').length;
  const plotFail=M2_GRID_PLOT_CELLS.filter(cell=>plots[cell.slug]?.verdict==='fail').length;
  const readiness=Object.fromEntries([...M2_GRID_SHARDS.flatMap(slug=>rows[slug]===undefined?[]:[[slug,rows[slug].gridReady]]),...Object.entries(plots)]);
  const m2={lower:ready/total,upper:(ready+unknown)/total,ready,unknown,total,shards:[...M2_GRID_SHARDS],plots:M2_GRID_PLOTS,
    plotReadiness:{ready:plotReady,fail:plotFail,unknown:M2_GRID_PLOTS-plotReady-plotFail,total:M2_GRID_PLOTS},readiness};
  const floorReady=grid.filter(row=>row?.gridReady.frameFloor?.verdict==='pass').length;
  const floorFail=grid.filter(row=>row?.gridReady.frameFloor?.verdict==='fail').length;
  const frameFloor={ready:floorReady,fail:floorFail,unknown:total-floorReady-floorFail,total};
  // G567: original custom lines are the denominator; report uncapped progress.
  const m3Share=m3;
  return {m3:{fraction:m3,cut,mustGo,shards:measured.length},m2,frameFloor,
    plan:m3Share===null?null:{lower:.6*m3Share+.4*m2.lower,upper:.6*m3Share+.4*m2.upper}};
}
