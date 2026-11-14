import { ENGINE_MUSIC_STYLE, engineMusicFiles, musicDir } from '@wildshard/engine/audio/bootAudio';
import { withAssetTables, type AssetTables } from '@wildshard/engine/boot/tables';
import { MUSIC_MANIFESTS, SFX_MANIFESTS } from '@wildshard/engine/game/boot/audio.generated';
import { PUBLIC_BYTES } from '@wildshard/engine/game/boot/bytes.generated';
import { ASSET_VERSIONS } from '@wildshard/engine/game/boot/versions.generated';
import { PACKS } from '@wildshard/engine/game/boot/packs.generated';
import type { AudioData } from '@wildshard/format/audio';

/** The engine's own boot tables, as the page installs them: which engine music ships, and each file's bytes. */
export const ENGINE_TABLES: AssetTables = { bytes: PUBLIC_BYTES, versions: ASSET_VERSIONS, music: MUSIC_MANIFESTS, sfx: SFX_MANIFESTS, packs: PACKS };

/** AUDIO AU18: the build log's line for the engine music a shard plays, derived from its `audio/audio` rows by name,
 *  in the engine cook's `engineMusicLine` format. Undefined when the shard has no audio section. Throws, naming each,
 *  when the rows name engine music this engine's style lacks. */
export function engineMusicLine(shard: string, section: unknown, tables: AssetTables = ENGINE_TABLES): string | undefined {
  if (typeof section !== 'object' || section === null || !('audio' in section)) return undefined;
  const data = section.audio as AudioData, dir = musicDir(ENGINE_MUSIC_STYLE);
  let files: string[];
  try { files = withAssetTables(tables, () => engineMusicFiles(data)); }
  catch (error) { throw new Error(`${shard}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
  const bytes = files.reduce((sum, url) => sum + (tables.bytes[url] ?? 0), 0);
  return `${shard}: engine music: ${files.length} files, ${(bytes / 1e6).toFixed(2)} MB${files.length === 0 ? '' : ` (${files.map(url => url.slice(dir.length)).join(', ')})`}`;
}
