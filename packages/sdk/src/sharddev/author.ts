// The SDK's starting shardfile (SHARD-AUTHORING SA26) lives once, in shard-format (FORMAT-PRUNE FP11, `./emptyShardfile`):
// admitted by the format's own parser, the one the client runs, with no `requires.sdk` (SHARD-COMPAT CP8). This path stays
// for authors' `@wildshard/sdk/author` imports, the name bound to the format's own.
import { emptyShardfile as formatEmptyShardfile } from '@wildshard/format/emptyShardfile';

/** Start an author project with a valid empty world; add baked content before shipping a playable shard. */
export const emptyShardfile: typeof formatEmptyShardfile = formatEmptyShardfile;
