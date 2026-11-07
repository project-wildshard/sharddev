#!/usr/bin/env node
// P4 command orchestration stays outside the importable census to avoid an async cycle.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkShares} from '@wildshard/engine/scripts/shard-platform.mjs';
import {outputReport} from './shard-output-report.mjs';
import {componentStates,componentWave,SHARD_WAVES} from '@wildshard/engine/scripts/shard-components.mjs';
import {closedComponentFailures} from '@wildshard/engine/scripts/check-closed-components.mjs';
import {componentSpanReports} from '@wildshard/engine/scripts/shard-component-spans.mjs';

const ROOT=resolve(import.meta.dirname,'..'),LIST='lint/shard-platform.json';
/** Run after the importable census has finished evaluating, without loading a
 * second copy of the complete module graph in another Node process. */
export async function runShardPlatformCli() {
  process.env.WS_SHARD_PARSE_CACHE ??= resolve(ROOT,'.cache/shard-parse');
  const build = !process.argv.includes('--no-build');
  const sourceProgress = process.argv.includes('--source-progress');
  if (build && !process.env.WS_HEAVY_TOKEN) {
    const {spawnSync} = await import('node:child_process');
    const result = spawnSync('python3', ['scripts/heavy-lane.py', 'build', '--', process.execPath, ...process.argv.slice(1)], {cwd:ROOT, stdio:'inherit'});
    process.exitCode = result.status ?? 1;
  } else {
    if (build) {
      // The copied product needs the same official cheap inputs as an app build.
      const {execFileSync}=await import('node:child_process');
      execFileSync(process.execPath,['scripts/gen.mjs','--proof'],{cwd:ROOT,stdio:['inherit',2,2]});
    }
    const productArg = process.argv.find(value => value.startsWith('--products='));
    const products = productArg === undefined ? resolve(ROOT, 'out') : resolve(ROOT, productArg.slice('--products='.length));
    const log=console.log,info=console.info;
    if(process.argv.includes('--json')){console.log=console.error;console.info=console.error;}
    let report;
    const receipts=process.argv.filter(value=>value.startsWith('--grid-receipt=')).map(value=>value.slice('--grid-receipt='.length));
    const scriptReceipts=process.argv.filter(value=>value.startsWith('--script-receipt=')).map(value=>value.slice('--script-receipt='.length));
    try {report=await outputReport(ROOT,{build,sourceProgress,products,reportOnly:!process.argv.includes('--check'),...(receipts.length===0?{}:{receipts}),...(scriptReceipts.length===0?{}:{scriptReceipts})});}
    finally {console.log=log;console.info=info;}
    const {rows,measures,sectionFailures,progress,netLines,dailyLines}=report;
    // Component closure in the labelled source-progress ruler must include
    // transitional shards whose standalone output has not closed yet.
    const componentMeasures=report.measurementError!==null?{}:sourceProgress?report.inventory:measures;
    const policy=JSON.parse(readFileSync(resolve(ROOT,'lint/ratchet.json'),'utf8'));
    const lockedShards=Object.keys(policy.closedComponents??{});
    // G514: custom-section budgets never stop the ruler; --check keeps them hard.
    const failures=process.argv.includes('--check')?[...sectionFailures]:[];
    if (failures.length===0) for (const failure of sectionFailures) console.error(`shard-platform: FAIL (report-only) ${failure}`);
    if (process.argv.includes('--json')) console.log(JSON.stringify({...rows,_summary:{metric:sourceProgress?'source-progress':'built-output',revision:process.env.VERCEL_GIT_COMMIT_SHA??null,closed:Object.keys(measures).length,total:Object.keys(rows).length,progress,netLines,dailyLines,customSectionFailures:sectionFailures,productFailures:report.productFailures,measurementError:report.measurementError,componentBasis:sourceProgress?'source':'built-output',sourceSpans:componentSpanReports(ROOT,report.inventory,Object.keys(rows),report.measurementError),components:componentStates(componentMeasures,lockedShards),waves:SHARD_WAVES.map(wave=>componentWave(componentMeasures,wave.id))}},null,2));
    else {
      console.log('shard                  closure    custom / frozen   escapes  M3 / basis       grid-ready  private JSON / bytes  AS / 10% legacy  private bin bytes  one-user build lines');
      for (const [slug,row] of Object.entries(rows)) {
        if(row.measurementError!==undefined){console.log(`${slug}: custom percentage unknown; ${row.measurementError}`);console.log(`  grid-ready ${row.gridReady.verdict}; ${JSON.stringify(row.gridReady.criteria)}; frame floor ${row.gridReady.frameFloor?.verdict??'unknown'}`);continue;}
        if(row.listedView!==undefined)console.log(`  ${slug} listed view ${row.listedView.listedViewLines}; other custom ${row.listedView.otherCustomLines}; total custom ${row.listedView.totalCustomLines} (unchanged, ${row.status==='unclosed'?'source':'built-output'} basis)`);
        const m3=row.m3===null?'native':`${(100*row.m3.fraction).toFixed(1)}% ${row.m3.basis}`;
        const ready=Object.entries(row.gridReady.criteria).map(([name,value])=>`${name}:${value.verdict}`).join(', ');
        const metrics=row.scriptMetrics,delta=row.linesRemovedSince12Z;
        console.log(`  ${slug} custom lines removed since ${dailyLines.since}: ${delta?.removed??'unknown'} (source ruler ${delta?.before??'unknown'} -> ${delta?.after??'unknown'}; baseline ${dailyLines.revision})`);
        console.log(`  ${slug} scripts: ${metrics.status}; AS ${row.assemblyScriptLines}/${row.assemblyScriptBudget?.ceiling??'native'}`);
        for(const scenario of metrics.scenarios)console.log(`    ${scenario.script} / ${scenario.scenario}: calls ${scenario.calls}, coarse fuel total/max ${scenario.fuel}/${scenario.maxFuel}, refusals ${scenario.refusals}; ${scenario.path} sha256:${scenario.receiptHash}`);
        for(const script of metrics.scripts.filter(value=>!value.measured))console.log(`    ${script.id}: fuel/calls unknown (no matching scenario receipt)`);
        if (row.status==='unclosed') {
          console.log(`${slug.padEnd(22)} unclosed   —                 ${row.escapes}  M3 ${m3}; grid ${row.gridReady.verdict}; JSON ${row.customSections?.length}/${row.customSectionBytes}; AS ${row.assemblyScriptLines}/${row.assemblyScriptBudget?.ceiling??'native'}`);
          console.log(`  grid-ready ${ready}; frame floor ${row.gridReady.frameFloor?.verdict??'unknown'}`);
          for (const file of row.files.slice(0,5)) console.log(`  ${file.path}: ${file.count} escapes; ${file.messages.join('; ')}`);
          if (row.refusal) console.log(`  strict copy: ${row.refusal}`);
          continue;
        }
        const pct=row.customPercent===null?'native':`${row.customPercent.toFixed(2)} %`;
        console.log(`${slug.padEnd(22)} closed     ${pct.padEnd(17)} 0        M3 ${m3}; grid ${row.gridReady.verdict}; ${row.customSections?.length}/${row.customSectionBytes}  AS ${row.assemblyScriptLines}/${row.assemblyScriptBudget?.ceiling??'native'}  bin ${row.content?.privateBinaryBytes}  build ${row.oneUserBuildTools?.lines}`);
        console.log(`  grid-ready ${ready}; frame floor ${row.gridReady.frameFloor?.verdict??'unknown'}`);
      }
      const percent=value=>`${(100*value).toFixed(1)} %`;
      console.log(`M3 six-shard total: ${progress.m3.fraction===null?'unknown':percent(progress.m3.fraction)}; ${progress.m3.cut}/${progress.m3.mustGo} must-go lines cut`);
      console.log(`M2 grid-ready: ${progress.m2.ready}/${progress.m2.total} pass, ${progress.m2.unknown}/${progress.m2.total} unknown; ${progress.m2.plots} plot cells counted separately`);
      console.log(`Frame floor (separate): ${progress.frameFloor.ready}/${progress.frameFloor.total} pass, ${progress.frameFloor.fail}/${progress.frameFloor.total} fail, ${progress.frameFloor.unknown}/${progress.frameFloor.total} unknown`);
      console.log(`Plan (60% M3 + 40% M2): ${progress.plan===null?'unknown':progress.plan.lower===progress.plan.upper?percent(progress.plan.lower):`${percent(progress.plan.lower)}–${percent(progress.plan.upper)} (M2 evidence incomplete)`}`);
      for(const wave of netLines) {
        console.log(`${wave.wave} net lines (report-only, historical source M0 ${wave.revision}): custom cut ${wave.customCut??'unknown'} - platform growth ${wave.platformGrowth} = ${wave.netCut??'unknown'}`);
        for(const [slug,row] of Object.entries(wave.shards))console.log(`  ${slug}: ${row.before} -> ${row.after??'unknown'} (${row.basis}), cut ${row.cut??'unknown'}`);
        for(const [layer,row] of Object.entries(wave.layers))console.log(`  ${layer}: ${row.before} -> ${row.after}, growth ${row.growth}`);
      }
      console.log('Since-noon counts use the source ruler on both dates, including ownership/ruler corrections. Output closure never supplies a cut; negative removed lines mean growth.');
      console.log('Platform growth includes all concurrent engine/game/SDK work and build tools, once per wave; historical source and current output/source units differ. Net lines never change custom % or gate.');
    }
    if (process.argv.includes('--check')) {
      const recorded=JSON.parse(readFileSync(resolve(ROOT,LIST),'utf8'));
      failures.push(...checkShares(recorded,measures));
      if(lockedShards.length>0)failures.push(...closedComponentFailures(report.inventory,policy.closedComponents));
    }
    for (const failure of failures) console.error(`shard-platform: ${failure}`);
    if (failures.length>0) process.exitCode=1;
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runShardPlatformCli();
