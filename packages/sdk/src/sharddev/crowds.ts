import { parseFlock } from '@wildshard/format/crowds';

/** Stable ordered flock declaration with seeded placement and host-owned native terrain/view/prey recipes. */
export type FlockData = ReturnType<typeof parseFlock>;
/** Admit finite crowd tuning before any world construction, setup draws or callback registration. */
export function flock(data: unknown): FlockData { return parseFlock(data); }
