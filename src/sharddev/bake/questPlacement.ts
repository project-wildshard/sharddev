/** Offline quest placement compiler. All floors, frames and model anchors are explicit data/callback inputs. */
/** Generic authored placement; `world` selects untransformed coordinates. */
export interface AuthorQuestPlace {
  poi: string;
  x: number;
  z: number;
  /** facing in the POI's frame (radians about +Y; 0 = the model's front faces +Z) */
  yaw?: number;
  /** absolute world y — skips the floor lookup */
  y?: number;
  /** metres above the floor found at (x, z) */
  dy?: number;
  /** a model anchor name (`<poi>.<name>`, e.g. `frame.marker`); used instead of x / z / yaw when the model exports it */
  anchor?: string;
}

/** A borrowed world-space quest anchor; an explicit height bypasses floor lookup. */
export interface AuthorQuestAnchor { readonly x: number; readonly z: number; readonly y?: number; readonly yaw?: number }
/** Existing terrain, walkable floors and model anchors lent to a quest placement resolver. */
export interface AuthorQuestPlacementPorts {
  readonly terrain: (x: number, z: number) => number;
  readonly platforms?: readonly ((x: number, z: number) => number | undefined)[];
  readonly registry?: { readonly floorAt: (x: number, z: number) => number | undefined };
  /** Strict height difference above the current floor; omitted accepts any higher registered floor. */
  readonly registryReach?: number;
  readonly frames?: Readonly<Record<string, { readonly x: number; readonly z: number; readonly rot: number }>>;
  readonly pois?: Readonly<Record<string, object | null>>;
}
const questNumber = (value: number): number => {
  if (!Number.isFinite(value) || Math.abs(value) > 1000000) throw new RangeError('Invalid quest placement coordinate');
  return value;
};
const questKey = (value: string): string => {
  if (value.length === 0 || value.length > 256 || value.split('.').some(key => key === '__proto__' || key === 'prototype' || key === 'constructor')) throw new Error('Invalid quest anchor path');
  return value;
};
function questAnchor(raw: unknown): AuthorQuestAnchor {
  if (typeof raw !== 'object' || raw === null || !('x' in raw) || !('z' in raw) || typeof raw.x !== 'number' || typeof raw.z !== 'number') throw new Error('Invalid borrowed quest anchor');
  const y = 'y' in raw ? raw.y : undefined, yaw = 'yaw' in raw ? raw.yaw : undefined;
  if ((y !== undefined && typeof y !== 'number') || (yaw !== undefined && typeof yaw !== 'number')) throw new Error('Invalid quest anchor height or yaw');
  return { x: questNumber(raw.x), z: questNumber(raw.z), ...(y === undefined ? {} : { y: questNumber(y) }), ...(yaw === undefined ? {} : { yaw: questNumber(yaw) }) };
}
/** Resolve bounded quest placements in their authored frames, with live borrowed floors.
 * Explicit quest anchors precede model anchors; the former ignore dy, while model
 * anchors add dy only when their height is omitted. No prompt, registry or save is owned.
 */
export function createAuthorQuestPlacements(ports: AuthorQuestPlacementPorts): {
  readonly floorAt: (x: number, z: number) => number;
  readonly place: (at: AuthorQuestPlace) => { x: number; y: number; z: number; yaw: number };
  readonly setAnchor: (name: string, anchor: AuthorQuestAnchor) => void;
  /** Borrow current validated anchors without introducing a second placement owner. */
  readonly anchors: ReadonlyMap<string, Readonly<AuthorQuestAnchor>>;
} {
  if (ports.registryReach !== undefined && (!Number.isFinite(ports.registryReach) || ports.registryReach <= 0)) throw new RangeError('Invalid quest registry reach');
  if ((ports.platforms?.length ?? 0) > 4096) throw new RangeError('Too many quest floors');
  if (Object.keys(ports.frames ?? {}).length > 4096) throw new RangeError('Too many quest frames');
  for (const [id, frame] of Object.entries(ports.frames ?? {})) { questKey(id); questNumber(frame.x); questNumber(frame.z); questNumber(frame.rot); }
  const own = new Map<string, AuthorQuestAnchor>();
  const floorAt = (x: number, z: number): number => {
    questNumber(x); questNumber(z);
    let y = questNumber(ports.terrain(x, z));
    for (const floor of ports.platforms ?? []) { const f = floor(x, z); if (f !== undefined && questNumber(f) > y) y = f; }
    const registered = ports.registry?.floorAt(x, z);
    if (registered !== undefined && questNumber(registered) > y && (ports.registryReach === undefined || registered - y < ports.registryReach)) y = registered;
    return y;
  };
  return {
    anchors: own, floorAt,
    setAnchor: (name, anchor) => {
      questKey(name);
      if (!own.has(name) && own.size >= 4096) throw new RangeError('Too many quest anchors');
      own.set(name, questAnchor(anchor));
    },
    place: p => {
      questKey(p.poi); questNumber(p.x); questNumber(p.z);
      const dy = p.dy === undefined ? 0 : questNumber(p.dy);
      if (p.anchor !== undefined) {
        questKey(p.anchor);
        const override = own.get(p.anchor);
        if (override !== undefined) return { x: override.x, z: override.z, y: override.y ?? floorAt(override.x, override.z), yaw: override.yaw ?? 0 };
        const [poi, name] = p.anchor.split('.');
        const model: unknown = poi === undefined ? undefined : Reflect.get(ports.pois ?? {}, poi);
        if (name !== undefined && typeof model === 'object' && model !== null && 'anchors' in model && typeof model.anchors === 'object' && model.anchors !== null && Object.hasOwn(model.anchors, name)) {
          const a = questAnchor(Reflect.get(model.anchors, name));
          return { x: a.x, z: a.z, y: a.y ?? floorAt(a.x, a.z) + dy, yaw: a.yaw ?? 0 };
        }
      }
      let x = p.x, z = p.z, yaw = p.yaw === undefined ? 0 : questNumber(p.yaw);
      if (p.poi !== 'world') {
        const frame = Object.hasOwn(ports.frames ?? {}, p.poi) ? ports.frames?.[p.poi] : undefined;
        if (frame === undefined) throw new Error(`Missing quest frame ${p.poi}`);
        const c = Math.cos(frame.rot), sin = Math.sin(frame.rot);
        x = frame.x + p.x * c + p.z * sin; z = frame.z - p.x * sin + p.z * c; yaw += frame.rot;
      }
      return { x: questNumber(x), z: questNumber(z), y: p.y === undefined ? floorAt(x, z) + dy : questNumber(p.y), yaw };
    },
  };
}
