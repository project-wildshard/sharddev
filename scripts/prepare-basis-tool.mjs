// The same checked SDK installer used by author contexts, outside the product CPU pool.
import { prepareBasisTool } from '../src/sharddev/bake/basisTool.ts';

const started = performance.now();
const tool = await prepareBasisTool();
console.info(JSON.stringify({ prerequisite: 'basis', milliseconds: Math.round(performance.now() - started), identity: tool.identity }));
