interface SpawnLayout {
  readonly spawn: { readonly x: number; readonly z: number };
  readonly creatures: {
    readonly brains: readonly { readonly id: string; readonly awareRadius?: number }[];
    readonly spawns: readonly { readonly id: string; readonly brain: string | null; readonly at: readonly [number, number, number] }[];
  };
}
/** Advisory layout findings; an author may deliberately place an encounter at arrival. */
export function spawnWarnings(shard: SpawnLayout): { code: string; message: string }[] {
  const brains = new Map(shard.creatures.brains.map(brain => [brain.id, brain]));
  return shard.creatures.spawns.flatMap(body => {
    const radius = body.brain === null ? undefined : brains.get(body.brain)?.awareRadius;
    if (radius === undefined || radius <= 0) return [];
    // Perception uses the ground plane; spawn height above the floor gives no safety.
    const distance = Math.hypot(body.at[0] - shard.spawn.x, body.at[2] - shard.spawn.z);
    return distance <= radius ? [{ code: 'spawn-aware-radius', message: `Creature ${body.id} (brain ${body.brain}) is ${distance.toFixed(1)} m from the player spawn, inside its ${radius} m aware radius; idle arrivals may be attacked` }] : [];
  });
}
/** The ordinary build/dev/validate output; check retains the same findings in its structured warnings. */
export function printSpawnWarnings(shard: SpawnLayout): void {
  for (const warning of spawnWarnings(shard)) console.warn(`warning: [${warning.code}] ${warning.message}. Move the creature or spawn farther apart, or reduce awareRadius (GUIDE.md#spawn-aware-radius)`);
}
