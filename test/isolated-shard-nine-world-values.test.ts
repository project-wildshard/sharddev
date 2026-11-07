// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["nine-dragon-stack/generators/bakedColliders", "nine-dragon-stack/generators/castSources", "nine-dragon-stack/generators/clothRest", "nine-dragon-stack/generators/ctx", "nine-dragon-stack/generators/facadeDressing", "nine-dragon-stack/shard.config", "nine-dragon-stack/generators/mapProgram", "nine-dragon-stack/generators/moversView", "nine-dragon-stack/generators/screenGraph", "nine-dragon-stack/generators/sharedRows", "nine-dragon-stack/generators/signAtlasOutput", "nine-dragon-stack/generators/signAtlasSources", "nine-dragon-stack/generators/well-plan", "nine-dragon-stack/generators/wellBounds", "nine-dragon-stack/generators/worldProgram", "nine-dragon-stack/generators/worldScenes", "nine-dragon-stack/generators/kit/kitSet", "nine-dragon-stack/generators/kit/tangentKit"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Nine world and kit declarations preserve generic maps and final numeric rows',()=>{
 const consumer=resolve('src/shards/t4-nine-second-consumer.ts');
 let source="import type {BufferGeometry} from 'three';\nimport {KitSet} from './nine-dragon-stack/generators/kit/kitSet';\nimport type {NineSourceWorld} from './nine-dragon-stack/generators/worldProgram';\nimport {CAST_SOURCES} from './nine-dragon-stack/generators/castSources';\nimport {MOVER_STAGES,MOVER_REST} from './nine-dragon-stack/generators/moversView';\nimport {SIGN_CHANNELS} from './nine-dragon-stack/generators/signAtlasOutput';\ninterface Builder{readonly vertexCount:number;build:()=>BufferGeometry;release:()=>void}\nexport function maps<K extends Builder,X extends Builder>(set:KitSet<K,X>):void{\n const kits:Map<string,K>=set.kits;const reverse:typeof set.kits=kits;void reverse;\n const alpha:Map<string,K>=set.alphaKits;const alphaReverse:typeof set.alphaKits=alpha;void alphaReverse;\n const swept:Map<string,X>=set.kitxs;const sweptReverse:typeof set.kitxs=swept;void sweptReverse;\n set.kits.set('one',set.kit('one'));set.alphaKits.set('one',set.alpha('one'));set.kitxs.set('one',set.kitx('one'));\n set.reflective.add('one');set.farOf.set('one',1);\n}\nexport function world(source:NineSourceWorld):void{\n const revision:1=source.layout.rows.version;void revision;\n source.layout.rows.counts.walkers=2;source.layout.records.push(0);\n const emitter=source.layout.rows.emitters[0];\n if(emitter!==undefined){const at:number=emitter.at[0];void at;emitter.at[0]=1;}\n}\nexport const stage:'nds-train'=MOVER_STAGES[0];\nconst pose=MOVER_REST[0];if(pose!==undefined)pose.x=1;\nconst pool=CAST_SOURCES[0],file=pool?.files[0];if(file!==undefined)file.file='another-owned-file';\nconst channel=SIGN_CHANNELS[0];if(channel!==undefined)channel.width=3;\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer,...ts.sys.readDirectory(resolve('src/game'),['.d.ts'],undefined,['**/*.merge.d.ts'])],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Nine world consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source="import type {BufferGeometry} from 'three';\nimport {KitSet} from './nine-dragon-stack/generators/kit/kitSet';\nimport type {NineSourceWorld} from './nine-dragon-stack/generators/worldProgram';\nimport {CAST_SOURCES} from './nine-dragon-stack/generators/castSources';\nimport {MOVER_STAGES,MOVER_REST} from './nine-dragon-stack/generators/moversView';\nimport {SIGN_CHANNELS} from './nine-dragon-stack/generators/signAtlasOutput';\ninterface Builder{readonly vertexCount:number;build:()=>BufferGeometry;release:()=>void}\nexport function maps<K extends Builder,X extends Builder>(set:KitSet<K,X>):void{\n const kits:Map<string,K>=set.kits;const reverse:typeof set.kits=kits;void reverse;\n const alpha:Map<string,K>=set.alphaKits;const alphaReverse:typeof set.alphaKits=alpha;void alphaReverse;\n const swept:Map<string,X>=set.kitxs;const sweptReverse:typeof set.kitxs=swept;void sweptReverse;\n set.kits.set('one',set.kit('one'));set.alphaKits.set('one',set.alpha('one'));set.kitxs.set('one',set.kitx('one'));\n set.reflective.add('one');set.farOf.set('one',1);\n}\nexport function world(source:NineSourceWorld):void{\n const revision:1=source.layout.rows.version;void revision;\n source.layout.rows.counts.walkers=2;source.layout.records.push(0);\n const emitter=source.layout.rows.emitters[0];\n if(emitter!==undefined){const at:number=emitter.at[0];void at;emitter.at[0]=1;}\n}\nexport const stage:'nds-train'=MOVER_STAGES[0];\nconst pose=MOVER_REST[0];if(pose!==undefined)pose.x=1;\nconst pool=CAST_SOURCES[0],file=pool?.files[0];if(file!==undefined)file.file='another-owned-file';\nconst channel=SIGN_CHANNELS[0];if(channel!==undefined)channel.width=3;\nexport function refuse<K extends Builder,X extends Builder>(set:KitSet<K,X>,source:NineSourceWorld):void{\n set.kits=new Map<string,K>();set.alphaKits=new Map<string,K>();set.kitxs=new Map<string,X>();set.reflective=new Set<string>();set.farOf=new Map<string,number>();\n source.layout.rows.counts.walkers='many';source.layout.rows.version=2;source.layout.records.push('bad');\n const emitter=source.layout.rows.emitters[0];if(emitter!==undefined)emitter.at[0]='bad';\n source.layout.rows.missing;set.missing;\n}\nMOVER_STAGES[0]='other';\nif(file!==undefined)file.file=1;\nif(channel!==undefined)channel.width='wide';\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(6);
 expect(refused.filter(code=>code===2345)).toHaveLength(1);
 expect(refused.filter(code=>code===2322)).toHaveLength(5);
 expect(refused.filter(code=>code===2339)).toHaveLength(2);
 expect(refused).toHaveLength(14);
});
