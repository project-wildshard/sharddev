// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["pine-hollow/generators/rangedPage", "pine-hollow/generators/roamingCombat", "pine-hollow/generators/roamingProjection", "pine-hollow/generators/sceneModelRows", "pine-hollow/generators/spawns", "pine-hollow/generators/speciesPrograms", "pine-hollow/generators/speciesRows", "pine-hollow/generators/strikes", "pine-hollow/generators/thrallClips", "pine-hollow/generators/timberMaterials", "pine-hollow/generators/timberPlacement", "pine-hollow/generators/timberSceneContribution", "pine-hollow/generators/timberSchema", "pine-hollow/generators/treeSet", "pine-hollow/generators/trophyWall", "pine-hollow/generators/wardensHollow", "pine-hollow/generators/weaponFinishes", "pine-hollow/generators/worldScenes"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=name==='pine-hollow/generators/timberSchema'?'test/fixtures/pine-timber-schema.ts':`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Pine forest declarations preserve schema metadata and native mutability',()=>{
 const consumer=resolve('src/shards/t4-pine-fourth-consumer.ts');
 let source="import * as v from 'valibot';\nimport {WEAPON_FINISHES} from './pine-hollow/generators/weaponFinishes';\nimport {TimberRowSchema} from '../../test/fixtures/pine-timber-schema';\nimport {PINE_SPECIES_PROGRAMS} from './pine-hollow/generators/speciesPrograms';\nimport {PINE_RUNTIME_SPAWNS} from './pine-hollow/generators/spawns';\nimport {TIMBER_MATERIALS} from './pine-hollow/generators/timberMaterials';\nexport const finish:'ghost-stag'=WEAPON_FINISHES['ghost-stag'].id;\nexport const first:'log'=TimberRowSchema.entries.parts.item.entries.key.options[0];\nexport const mode:'origin'=PINE_SPECIES_PROGRAMS.hunt.player;\nexport const input:v.InferInput<typeof TimberRowSchema>={parts:[{key:\"log\",counts:[1]}],glass:[],colliders:[Symbol()],floors:[],anchors:{origin:[0,0,0]}};\nconst species=PINE_SPECIES_PROGRAMS.program.species[0];\nif(species!==undefined)species.kind='another-kind';\nconst boss=PINE_RUNTIME_SPAWNS.bosses[0];\nif(boss!==undefined)boss.id='another-actor';\nconst material=TIMBER_MATERIALS[0];\nif(material!==undefined)material.properties.color=0xff0000;\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer,...ts.sys.readDirectory(resolve('src/game'),['.d.ts'],undefined,['**/*.merge.d.ts'])],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Pine author consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+="WEAPON_FINISHES['ghost-stag'].id='another-finish';\nTimberRowSchema.entries.parts.item.entries.key.options[0]='cloth';\nPINE_SPECIES_PROGRAMS.hunt.player='elsewhere';\nif(species!==undefined)species.kind=2;\nif(boss!==undefined)boss.id=2;\nif(material!==undefined)material.properties.color='red';\nTimberRowSchema.entries.missing;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(3);
 expect(refused.filter(code=>code===2322)).toHaveLength(3);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused).toHaveLength(7);
});
