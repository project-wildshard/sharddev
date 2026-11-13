// SHARD-AUTHORING SA43: the preview `wildshard prepare <folder>` records in when no --base is given. It serves engine's
// preparation client (a WILDSHARD_PREPARATION_ONLY production build, fetched at this package's engine pin, src/sharddev/
// devClient.ts) with the candidate's shard.json inline as `ws-shardfile`, as `wildshard dev` serves the devserver client,
// and the candidate folder beside the page (as `wildshard build` lays a client over its product) and where a release
// serves a shard, `/shardfiles/<slug>/`. No engine checkout is needed.
import {createServer} from 'node:http';
import {createReadStream,existsSync,readFileSync,realpathSync,statSync} from 'node:fs';
import {extname,resolve,sep} from 'node:path';

const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml',
  '.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ktx2':'image/ktx2','.m4a':'audio/mp4','.ogg':'audio/ogg','.glb':'model/gltf-binary'};

/** A file under `root` for the request path `local`, or undefined (never one outside it, symlinks included). */
function inside(root,local){
  const file=resolve(root,local);
  if(!file.startsWith(`${root}${sep}`)||!existsSync(file)||!statSync(file).isFile())return undefined;
  return realpathSync(file).startsWith(`${root}${sep}`)?file:undefined;
}

/** Serve `client` with the candidate `dir` (a built shard file folder) inline; resolves to {url, close}. */
export async function preparationPreview(client,dir,{clientPage}){
  client=realpathSync(resolve(client));dir=realpathSync(resolve(dir));
  const header=readFileSync(resolve(dir,'shard.json'),'utf8'),slug=JSON.parse(header).identity.slug;
  // The inline descriptor is the candidate's own index bytes, `<` escaped as `wildshard build` writes it.
  const recorded=existsSync(resolve(dir,'programs',`${slug}.json`));
  const page=clientPage(readFileSync(resolve(client,'index.html'),'utf8'),header.trim().replaceAll('<','\\u003c'),slug,recorded);
  const shardRoot=`/shardfiles/${slug}/`;
  const server=createServer((request,response)=>{
    response.setHeader('Cache-Control','no-store');
    try{
      if(request.method!=='GET'&&request.method!=='HEAD'){response.writeHead(405);response.end();return;}
      const path=decodeURIComponent(new URL(request.url??'/','http://localhost').pathname);
      if(path==='/'||path==='/index.html'){response.setHeader('Content-Type','text/html');response.end(request.method==='HEAD'?undefined:page);return;}
      // The inline product reads beside the page, as `wildshard build` lays the client over the product folder (the
      // client's file wins); the in-page server reads where a release serves the shard.
      const file=path.startsWith(shardRoot)?inside(dir,path.slice(shardRoot.length)):inside(client,path.slice(1))??inside(dir,path.slice(1));
      if(file===undefined){response.writeHead(404);response.end();return;}
      response.setHeader('Content-Type',MIME[extname(file)]??'application/octet-stream');
      if(request.method==='HEAD')response.end();else createReadStream(file).on('error',()=>{response.destroy();}).pipe(response);
    }catch{response.writeHead(400);response.end();}
  });
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',()=>{done(undefined);});});
  const address=server.address();if(address===null||typeof address==='string')throw new Error('No preparation preview address');
  return {url:`http://127.0.0.1:${address.port}/`,slug,close:()=>new Promise(done=>{server.close(()=>{done(undefined);});server.closeAllConnections();})};
}
