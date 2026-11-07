import * as v from 'valibot';
import { AudioDataSchema as schema, parseAudioData as parseData, type AudioData as Data } from '@wildshard/format/audio';

/** Compile cue mappings, wind ambience and silent/default score declarations. */
export const AudioDataSchema: v.SchemaWithPipe<readonly [typeof schema]> = v.pipe(schema);
/** A serialisable audio recipe whose voice ids the platform catalogue admits. */
export type AudioData = Data;
/** Validate the thin audio section before compiling a shardfile. */
export function parseAudioData(input: unknown): Data { return parseData(input); }
