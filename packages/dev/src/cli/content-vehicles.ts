// Meta MIRROR-SALT-ZONE MSZ4: `wildshard content`'s vehicle counts: the kinds (`world/vehicles`), their seats, the docks.

interface VehicleCounts {
  readonly vehicleKinds: number
  readonly vehicleSeats: number
  readonly vehicleDocks: number
}

const NONE = 0

function rows(value: unknown, key: string): readonly unknown[] {
  const field: unknown =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Reflect.get(value, key)
      : undefined
  return Array.isArray(field) ? field : []
}

/** The counts of a built shard's `world/vehicles` section (an empty object when it has none). */
function vehicleCounts(section: unknown): VehicleCounts {
  const kinds = rows(section, 'kinds')
  return {
    vehicleKinds: kinds.length,
    vehicleSeats: kinds.reduce<number>(
      (total, kind): number => total + rows(kind, 'seats').length,
      NONE,
    ),
    vehicleDocks: rows(section, 'docks').length,
  }
}

export { vehicleCounts }
export type { VehicleCounts }
