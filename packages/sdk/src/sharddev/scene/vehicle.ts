import { Box3, Quaternion, Vector3, type Object3D } from 'three';
import { parseVehicles, type VehicleDock, type VehicleHullBox, type VehicleKind, type VehicleSeat, type Vehicles } from '@wildshard/format/vehicles';
import type { SceneCollider } from './description';
import { SceneRefusalError } from './refusal';

/**
 * MIRROR-SALT-ZONE MSZ3: `world.vehicle(kind, build, options)` and `world.dock(id, at, { kind })`, lowered to format
 * `world/vehicles` (MSZ1). A kind is built about its own origin, facing -z: the build's base at y 0, its seats where the
 * empties named `seat.driver` and `seat.passenger` (or `seat.passenger.2`, ...) stand, its leave points where `leave.driver`
 * and `leave.passenger` stand (or a step past the footprint's side by the seat), its hull its `solid()` meshes.
 */
export interface VehicleKindOptions {
  /** top speed in m/s (0.005 to 60) */
  readonly speed: number;
  /** top speed backwards in m/s (0 to `speed`; default the lesser of 6 and `speed`) */
  readonly reverse?: number;
  /** m/s² it gains speed (0.005 to 100; default 6) */
  readonly accel?: number;
  /** m/s² it sheds speed braking (0.005 to 200; default twice `accel`) */
  readonly brake?: number;
  /** radians a second at full stick (0.005 to 2π; default 1.2) */
  readonly turn?: number;
  /** 0 slides like ice, 1 never slips (default 0.9) */
  readonly grip?: number;
  /** 0 to 1, how long a slide lasts (default 0.3) */
  readonly drift?: number;
  /** how much faster boost goes (1 to 4; default 1.5) */
  readonly boost?: number;
  /** kg, who gives way in a crash (1 to 50,000; default 500) */
  readonly mass?: number;
  /** follow the ground under it (default true), or keep its dock's height (a boat on still water) */
  readonly ground?: boolean;
  /** a sail: the wind blowing toward (x, z) pushes it up to `push` m/s (0 to 20) along its heading */
  readonly wind?: { readonly toward: readonly [number, number]; readonly push: number };
  /** hit points, if crashes wear it down (1 to 100,000; default none) */
  readonly health?: number;
  /** audio cue ids it plays (`audio.cues`): the engine loop, a skid, an impact and a horn */
  readonly sounds?: { readonly loop?: string; readonly skid?: string; readonly impact?: string; readonly horn?: string };
  /** the prompt labels (default the engine's): get in to drive, get in to ride, get out */
  readonly labels?: { readonly drive?: string; readonly ride?: string; readonly leave?: string };
  /** how its riders sit: `sit` (default) or `stand` (a sail's deck) */
  readonly pose?: 'sit' | 'stand';
}

/** Where a kind stands: `kind` (a `world.vehicle` kind), each player's own (`player`, the default) or one everyone shares. */
export interface DockOptions {
  readonly kind: string;
  readonly per?: 'player' | 'shared';
  /** seconds before it comes back (0 to 3600; default 60) */
  readonly respawn?: number;
}

const SEAT = /^seat\.(driver|passenger(?:\.\d+)?)$/u;
const STEP = 0.8;
const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const vec = (v: Vector3): [number, number, number] => [r3(v.x), r3(v.y), r3(v.z)];

/** Every named empty under `root` matching `pattern`, by its name. */
function named(root: Object3D, pattern: RegExp): Map<string, Object3D> {
  const found = new Map<string, Object3D>();
  root.traverse((object) => { if (pattern.test(object.name)) { if (found.has(object.name)) throw new SceneRefusalError(root.name, `two nodes are named ${object.name}`, 'Name each seat and leave point once'); found.set(object.name, object); } });
  return found;
}

/** One collider of a kind's part as a hull box in the kind's frame: upright boxes keep their turn, others their bounds. */
function hullBox(root: Object3D, collider: SceneCollider): VehicleHullBox {
  const back = root.getWorldQuaternion(new Quaternion()).invert();
  const at = root.worldToLocal(new Vector3(...collider.centre));
  const q = back.multiply(new Quaternion(...collider.rotation)), up = new Vector3(0, 1, 0).applyQuaternion(q);
  if (up.y > 0.9999) {
    const forward = new Vector3(1, 0, 0).applyQuaternion(q), yaw = r3(Math.atan2(-forward.z, forward.x));
    return { at: vec(at), half: [r3(collider.half[0]), r3(collider.half[1]), r3(collider.half[2])], ...(yaw === 0 ? {} : { yaw }) };
  }
  const half = new Vector3(...collider.half), extent = new Vector3();
  for (const axis of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]) {
    const turned = axis.clone().applyQuaternion(q);
    extent.add(new Vector3(Math.abs(turned.x), Math.abs(turned.y), Math.abs(turned.z)).multiplyScalar(axis.dot(half)));
  }
  return { at: vec(at), half: vec(extent) };
}

/** MSZ3: a `world.vehicle` part as a format kind: its seats and leave points from its empties, its hull from its solids. */
export function vehicleKindOf(root: Object3D, id: string, options: VehicleKindOptions, colliders: readonly SceneCollider[]): VehicleKind {
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) throw new SceneRefusalError(id, 'a vehicle has no bounds', 'Give it a mesh');
  const seats = named(root, SEAT), leaves = named(root, /^leave\./u);
  if (!seats.has('seat.driver')) throw new SceneRefusalError(id, 'a vehicle has no seat.driver', 'Add an empty Object3D named seat.driver where the driver sits');
  for (const name of leaves.keys()) if (!seats.has(`seat.${name.slice('leave.'.length)}`)) throw new SceneRefusalError(id, `${name} has no seat`, `Add seat.${name.slice('leave.'.length)}, or drop ${name}`);
  root.updateWorldMatrix(true, true);
  const local = new Box3().copy(box).applyMatrix4(root.matrixWorld.clone().invert());
  const order = [...seats.keys()].sort((a, b) => Number(b === 'seat.driver') - Number(a === 'seat.driver') || a.localeCompare(b));
  const seatRows = order.map((name): VehicleSeat => {
    const node = seats.get(name), at = root.worldToLocal(node?.getWorldPosition(new Vector3()) ?? new Vector3());
    const leave = leaves.get(`leave.${name.slice('seat.'.length)}`);
    const side = at.x < 0 || (at.x === 0 && name === 'seat.driver') ? local.min.x - STEP : local.max.x + STEP;
    const out = leave === undefined ? new Vector3(side, 0, at.z) : root.worldToLocal(leave.getWorldPosition(new Vector3()));
    return { role: name === 'seat.driver' ? 'driver' : 'passenger', at: vec(at), pose: options.pose ?? 'sit', leave: vec(out) };
  });
  const speed = options.speed, accel = options.accel ?? 6;
  return {
    id, panel: id,
    ...(options.labels === undefined ? {} : { labels: { ...options.labels } }),
    seats: seatRows,
    hull: colliders.map((collider) => hullBox(root, collider)),
    handling: { speed, reverse: options.reverse ?? Math.min(6, speed), accel, brake: options.brake ?? 2 * accel, turn: options.turn ?? 1.2, grip: options.grip ?? 0.9,
      drift: options.drift ?? 0.3, boost: options.boost ?? 1.5, mass: options.mass ?? 500, ground: options.ground ?? true,
      ...(options.wind === undefined ? {} : { wind: { toward: [options.wind.toward[0], options.wind.toward[1]], push: options.wind.push } }) },
    ...(options.health === undefined ? {} : { health: options.health }),
    ...(options.sounds === undefined ? {} : { sounds: { ...options.sounds } }),
  };
}

/** MSZ3: a dock at a node's world position, facing the node's heading (its +z turned to the kind's -z frame, as spawnAt). */
export function dockOf(id: string, at: Vector3, node: Object3D, options: DockOptions): VehicleDock {
  const ahead = node.getWorldDirection(new Vector3());
  return { id, kind: options.kind, at: vec(at), yaw: r3(Math.atan2(ahead.x, ahead.z)), per: options.per ?? 'player', respawn: options.respawn ?? 60 };
}

/** The scene's kinds and docks through the format's own schema, its refusal named as the scene's. */
export function sceneVehicles(kinds: readonly VehicleKind[], docks: readonly VehicleDock[]): Vehicles {
  try {
    return parseVehicles({ kinds, docks });
  } catch (error) {
    throw new SceneRefusalError('world.vehicle', error instanceof Error ? error.message : String(error), 'Keep a vehicle\'s numbers, seats and hull in the format\'s range (GUIDE.md#vehicles)');
  }
}

/** How far a dock or leave point may sit off the ground (m), and how far a hull may dip into it at rest. */
const GROUND_SLACK = 0.5, HULL_SINK = 0.05;
/** A dock's clearance probe: this far over its point, inside no static solid. */
const PROBE_RISE = 0.5;

/** Whether `point` lies inside a world collider box. */
function inside(point: Vector3, collider: SceneCollider): boolean {
  const local = point.clone().sub(new Vector3(...collider.centre)).applyQuaternion(new Quaternion(...collider.rotation).invert());
  return Math.abs(local.x) <= collider.half[0] && Math.abs(local.y) <= collider.half[1] && Math.abs(local.z) <= collider.half[2];
}
/** A kind-frame point at a dock, in the cell's frame. */
function atDock(dock: VehicleDock, point: readonly [number, number, number]): Vector3 {
  return new Vector3(...point).applyAxisAngle(new Vector3(0, 1, 0), dock.yaw).add(new Vector3(...dock.at));
}

/**
 * MIRROR-SALT-ZONE MSZ4: what `wildshard check` (and every build) refuses of a dock: standing off the ground or inside a
 * static solid, a leave point off the ground or inside its own hull, or a hull under the ground at rest.
 */
export function dockRefusals(vehicles: Vehicles, heightAt: (x: number, z: number) => number, solids: readonly SceneCollider[]): { id: string; why: string; fix: string }[] {
  const kinds = new Map(vehicles.kinds.map((kind) => [kind.id, kind]));
  return vehicles.docks.flatMap((dock) => {
    const kind = kinds.get(dock.kind);
    if (kind === undefined) return [];
    const [x, y, z] = dock.at, ground = heightAt(x, z), found: { id: string; why: string; fix: string }[] = [];
    if (Math.abs(y - ground) > GROUND_SLACK) found.push({ id: dock.id, why: `dock ${dock.id} stands ${(y - ground).toFixed(2)} m off the ground`, fix: 'Put its node on the ground' });
    const probe = new Vector3(x, y + PROBE_RISE, z), rock = solids.find((solid) => inside(probe, solid));
    if (rock !== undefined) found.push({ id: dock.id, why: `dock ${dock.id} stands inside the solid ${rock.path}`, fix: 'Move its node clear of solids' });
    for (const seat of kind.seats) {
      const out = atDock(dock, seat.leave);
      if (Math.abs(out.y - heightAt(out.x, out.z)) > GROUND_SLACK) found.push({ id: dock.id, why: `dock ${dock.id}'s ${seat.role} leave point is off the ground`, fix: 'Move its leave empty to the ground beside the vehicle, or level the ground there' });
      const hull = kind.hull.some((box) => { const turn = (box.yaw ?? 0) + dock.yaw; const local = out.clone().sub(atDock(dock, box.at)).applyAxisAngle(new Vector3(0, 1, 0), -turn); return Math.abs(local.x) <= box.half[0] && Math.abs(local.y) <= box.half[1] && Math.abs(local.z) <= box.half[2]; });
      if (hull) found.push({ id: dock.id, why: `dock ${dock.id}'s ${seat.role} leave point is inside its hull`, fix: 'Move its leave empty past the vehicle\'s side' });
    }
    for (const box of kind.hull) {
      const centre = atDock(dock, box.at), bottom = centre.y - box.half[1];
      if (bottom < heightAt(centre.x, centre.z) - HULL_SINK) { found.push({ id: dock.id, why: `dock ${dock.id}'s hull sits ${(heightAt(centre.x, centre.z) - bottom).toFixed(2)} m under the ground`, fix: 'Raise the dock or the vehicle\'s solids to its base' }); break; }
    }
    return found;
  });
}
