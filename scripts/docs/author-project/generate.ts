import { mkdirSync, writeFileSync } from 'node:fs';
import { compileBehaviourModule } from '@wildshard/sdk/buildBehaviour';
import { generateScriptModule } from '@wildshard/sdk/directorAbi';
import { buildWorld, disposeWorld, worldBytes } from './generators/world.ts';

const idle = generateScriptModule({ version: 1, sharedOwner: 'host', playerKey: 'actorId', shared: [], player: [] }, '');
const compiled = await compileBehaviourModule(idle.source, 1);
const scene = buildWorld();
try {
  mkdirSync('assets', { recursive: true });
  mkdirSync('data', { recursive: true });
  writeFileSync(`assets/${compiled.module}`, compiled.bytes);
  writeFileSync('data/generated-script.json', JSON.stringify({
    generated: 'DO-NOT-EDIT: run npm run generate; retained generate.ts is the source.',
    hash: compiled.module, bytes: compiled.bytes.length,
  }, null, 2) + '\n');
  writeFileSync('assets/world.glb', worldBytes(scene));
} finally { disposeWorld(scene); }
