import * as v from 'valibot';

/** Ordered recorded surface slot, before text selection or geometry creation. */
export interface RecordedSignSlot {
  at: [number, number, number];
  normal: [number, number, number];
  size: number;
  color: number;
  blade: boolean;
}

/** Read explicitly named strict sign groups from an authored record path.
 * Enclosing records retain their native strip behavior. Slot numbers use the
 * original numeric grammar; finiteness and size bounds belong to the bake. */
export function recordedSignGroups<const Groups extends readonly string[]>(
  input: unknown, groups: Groups, path?: readonly string[],
): Record<Groups[number], RecordedSignSlot[]>;
export function recordedSignGroups(input: unknown, groups: readonly string[], path: readonly string[] = []): Record<string, RecordedSignSlot[]> {
  const vector = v.tuple([v.number(), v.number(), v.number()]);
  const slot = v.strictObject({ at: vector, normal: vector, size: v.number(), color: v.number(), blade: v.boolean() });
  let value = input;
  for (const key of path) value = v.parse(v.object({ [key]: v.unknown() }), value)[key];
  const entries = Object.fromEntries(groups.map(key => [key, v.array(slot)]));
  return v.parse(v.strictObject(entries), value);
}
