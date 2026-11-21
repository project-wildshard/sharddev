import { describe, expect, it } from 'vitest';
import { nativeRapierFile, openShardProof, type ShardProofPorts } from './proof';

// SHARD-COMPAT CP18b: the harness admits the folder first and refuses one with no built index before it loads
// physics or boots a world. Real boots (Far Reach, Sunscar Dunes) are proved on built folders, not here.
function fakePorts(calls: string[]): ShardProofPorts {
  const refuse = (step: string) => async (): Promise<never> => { calls.push(step); return await Promise.reject(new Error(`${step} must not run`)); };
  const admit: ShardProofPorts['admit'] = async (directory, mode) => {
    calls.push(`admit ${directory} ${mode}`);
    return await Promise.resolve({ product: JSON.parse('{"shardfile":{"identity":{"slug":"demo","revision":1}},"slug":"demo","revision":1}'), assets: new Map<string, Uint8Array>() });
  };
  return { admit, rapier: refuse('rapier'), resident: refuse('resident') };
}

describe('openShardProof', () => {
  it('names the pinned physics wasm', () => {
    expect(nativeRapierFile).toMatch(/rapier_wasm3d_bg\.wasm$/u);
  });
  it('refuses a folder with no built index before booting', async () => {
    const calls: string[] = [];
    await expect(openShardProof('out/demo', {}, fakePorts(calls))).rejects.toThrow(/Not a built shard folder: out\/demo/u);
    expect(calls).toEqual(['admit out/demo full']);
  });
});
