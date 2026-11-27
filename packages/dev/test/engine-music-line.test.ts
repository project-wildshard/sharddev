import { describe, expect, it } from 'vitest';
import { engineMusicLine } from '../src/sharddev/engineMusic';

// SF7 (meta standalone shardfiles): wildshard check's validate called this outside any installed tables, and the engine's
// music folder now reads them (SF4), so every shard with an audio section failed with "No asset tables installed".
describe('engineMusicLine', () => {
  it('reads the music folder from the tables it is handed, with none installed', () => {
    expect(engineMusicLine('fixture', { audio: {} })).toMatch(/^fixture: engine music: \d+ files,/u);
  });
});
