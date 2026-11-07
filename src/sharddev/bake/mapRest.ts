import { BufferGeometry, Group, InstancedMesh, MeshBasicMaterial } from 'three';
import { createClientChannelView, moverChannelValues } from '@wildshard/engine/game/plugin/clientChannelView';
import { parseClientChannels } from '@wildshard/format/clientChannels';
import type { MoverPose } from '@wildshard/engine/physics/mover';

/** Only the initial private transforms and instance slots used by the map projection. */
export interface MapRestNode {
  readonly id: string;
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly quaternion?: readonly [number, number, number, number];
  readonly scale?: readonly [number, number, number];
  readonly order?: 'XYZ' | 'YXZ' | 'ZXY' | 'ZYX' | 'YZX' | 'XZY';
  readonly visible?: boolean;
  readonly instances?: number;
  readonly matrices?: readonly number[];
}
/** Initial presentation rows; all numbers retain the native CPU channel projection. */
export interface MapRestRows {
  readonly version: 1;
  readonly nodes: Readonly<Record<string, { position: number[]; quaternion: number[]; scale: number[]; visible: boolean; matrices?: number[] }>>;
}

/** Project declared mover rest poses without a renderer, physics installation or filesystem authority.
 * Every instance slot must be initialized; missing movers and incomplete coverage refuse. */
export function mapSceneRest(scene: { readonly nodes: readonly MapRestNode[] }, input: unknown, poses: readonly (MoverPose & { readonly id: string })[]): MapRestRows {
  const programs = parseClientChannels(input), targets = new Map<string, Group | InstancedMesh>(), coverage = new Map<string, Uint8Array>();
  const nodes: Record<string, MapRestRows['nodes'][string]> = {}, movers = new Map(poses.map(pose => [pose.id, pose]));
  const geometry = new BufferGeometry(), material = new MeshBasicMaterial();
  try {
    for (const row of scene.nodes) {
      const target = row.instances === undefined ? new Group() : new InstancedMesh(geometry, material, row.instances);
      if (row.position !== undefined) target.position.fromArray(row.position);
      if (row.rotation !== undefined) target.rotation.set(...row.rotation, row.order ?? 'XYZ');
      if (row.quaternion !== undefined) target.quaternion.fromArray(row.quaternion);
      if (row.scale !== undefined) target.scale.fromArray(row.scale);
      if (row.visible !== undefined) target.visible = row.visible;
      if (row.matrices !== undefined && target instanceof InstancedMesh) target.instanceMatrix.array.set(row.matrices);
      if (row.instances !== undefined) coverage.set(row.id, new Uint8Array(row.instances).fill(row.matrices === undefined ? 0 : 1));
      targets.set(row.id, target);
    }
    for (const program of programs) {
      if (program.mover === undefined) throw new Error(`Map rest needs a declared mover: ${program.id}`);
      const pose = movers.get(program.mover); if (pose === undefined) throw new Error(`Missing map rest pose ${program.mover}`);
      const view = createClientChannelView(program, targets);
      view.evaluate({ time: 0, delta: 0, values: moverChannelValues(view.reads, pose, {}) });
      for (const connector of program.connectors ?? []) {
        const slots = coverage.get(connector.target), span = connector.instances;
        if (slots !== undefined && span !== undefined) slots.fill(1, span.start, span.start + span.capacity);
      }
    }
    for (const [id, slots] of coverage) if (slots.some(value => value === 0)) throw new Error(`Incomplete map rest instance slots ${id}`);
    for (const [id, target] of targets) nodes[id] = { position: target.position.toArray(), quaternion: target.quaternion.toArray(), scale: target.scale.toArray(), visible: target.visible,
      ...(target instanceof InstancedMesh ? { matrices: Array.from(target.instanceMatrix.array) } : {}) };
    return { version: 1, nodes };
  } finally { geometry.dispose(); material.dispose(); }
}
