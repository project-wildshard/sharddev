// Real api-server app, SQL migrations, account auth and R2 protocol. Only the
// cook and game acknowledgement are doubles; every status response is real.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {serve} from '@hono/node-server';

const SOURCE=process.env.WILDSHARD_API_SOURCE;
assert.ok(SOURCE, 'WILDSHARD_API_SOURCE must name the pinned API contract checkout');
const root=resolve(SOURCE);
const load=path=>import(pathToFileURL(resolve(root,path)).href);
const [{createApp},{openPglite},{applyMigrations},{createCatalogueStore},
  {depsFromEnv},{createR2ObjectStore},{startS3Double},{makeShardfile},
  {runMigrateJob},{doubles},{activateUpload,uploadActivator}]=await Promise.all([
  load('src/server/app.ts'),load('src/server/catalogue/pglite.ts'),
  load('src/server/catalogue/migrations.ts'),load('src/server/catalogue/catalogue-store.ts'),
  load('src/server/env.ts'),load('src/server/storage/r2-object-store.ts'),
  load('src/test/helpers/s3-double.ts'),load('src/test/helpers/shardfile.ts'),
  load('src/server/migrate/run-job.ts'),load('src/test/helpers/migrate.ts'),
  load('src/server/uploads/activate.ts'),
]);

export const REPORT={failures:[{path:'entries',reason:'portal walk refused',detail:{cell:[1,-2]}}]};
export const TARBALL=await makeShardfile({slug:'async-sdk-isle'});

async function recordCook(fixture,id,hash,result){
  const status=await fixture.catalogue.uploads.verdict(id,{
    verdict: result==='refused'?{result,hash,report:REPORT}:
      {result,hash,build:'fake-engine-check',report:{ok:true}},
    now:new Date(),
  });
  assert.ok(status,'fake trusted verdict must settle the real upload');
}

async function stage(fixture,upload){
  const before=await fixture.sql.query("select slug from grid_cells where slug='async-sdk-isle'");
  assert.deepEqual(before.rows,[],'no cell may be reserved before a verdict');
  await recordCook(fixture,upload.uploadId,upload.hash,'cooked');
  const {deps}=doubles(fixture.sql,new Map(),{
    originals:fixture.store, activate:uploadActivator(fixture.deps),
  });
  for(const job of await fixture.catalogue.ledger.jobsFor(upload.hash)){
    try { await runMigrateJob(deps,job); }
    catch(error) {
      // The minimum landed API contract threw for a pending acknowledgement;
      // SP20 treats the same durable staged state as a normal async outcome.
      assert.match(String(error),/not acknowledged/u);
    }
  }
  assert.equal((await fixture.catalogue.uploads.byHash(upload.hash)).status,'staged');
}

async function afterResponse(fixture,request,response,mode){
  if(response.status!==200&&response.status!==202)return;
  const path=new URL(request.url).pathname;
  if(request.method==='POST'&&path.endsWith('/commit')){
    const upload=await response.clone().json();
    fixture.id=upload.uploadId;
    fixture.hash=upload.hash;
    if(mode==='refused')await recordCook(fixture,upload.uploadId,upload.hash,'refused');
    if(mode==='stalled'){
      // SP21 reads a stalled status; SP20a separately proves its real timer.
      await fixture.sql.query("update upload_statuses set status='stalled' where id=$1",[upload.uploadId]);
    }
  }
  if(request.method==='GET'&&path===`/api/shardfiles/uploads/${fixture.id}`){
    const upload=await response.clone().json();
    fixture.states.push(upload.status);
    if(mode==='live'&&upload.status==='cooking')await stage(fixture,upload);
    if(mode==='live'&&upload.status==='staged'){
      fixture.ack=true;
      await activateUpload(fixture.deps,upload.hash);
    }
  }
}

export async function openApi(context,mode){
  const sql=await openPglite();
  context.after(sql.close);
  await applyMigrations(sql);
  const s3=await startS3Double();
  context.after(s3.close);
  const store=createR2ObjectStore(s3);
  const catalogue=createCatalogueStore(sql);
  const fixture={sql,store,catalogue,ack:false,states:[],id:undefined,hash:undefined};
  const deps=depsFromEnv({GRID_AUTOPLACE:'staging',ADMIN_TOKEN:'fixture-grid-admin'},
    {version:'api-contract-2ad9890',store,records:store,presigner:store,catalogue,
      notifier:{notify:async()=>fixture.ack}});
  fixture.deps=deps;
  const app=createApp(deps);
  const account=await app.request('/api/accounts',{method:'POST',
    body:JSON.stringify({email:'sdk-contract@example.test'})});
  assert.equal(account.status,201);
  fixture.apiKey=(await account.json()).key;
  const grid=await app.request('/api/catalogue/grid',{method:'PUT',
    headers:{authorization:'Bearer fixture-grid-admin'},
    body:await readFile(resolve(root,'src/test/fixtures/first-party-grid.json'),'utf8')});
  assert.equal(grid.status,200);
  const server=serve({hostname:'127.0.0.1',port:0,fetch:async request=>{
    const response=await app.fetch(request);
    await afterResponse(fixture,request,response,mode);
    return response;
  }});
  context.after(async()=>{
    const closed=once(server,'close');
    server.closeAllConnections();server.close();await closed;
  });
  if(!server.listening)await once(server,'listening');
  fixture.url=`http://127.0.0.1:${server.address().port}`;
  return fixture;
}
