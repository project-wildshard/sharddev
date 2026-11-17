import rows from './driftwood-movers.json' with {type:'json'};
import {parseMoverRows} from '../../src/sharddev/movers';

/** Frozen original mover rows; no shard code executes in this SDK proof. */
export const originalDriftwoodMovers = (): ReturnType<typeof parseMoverRows> => parseMoverRows(structuredClone(rows));
