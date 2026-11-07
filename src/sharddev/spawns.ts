import { Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { updateAuthoringMatrix } from './sceneTransform';
import type { SpawnTables } from '@wildshard/format/spawnTables';

/** Complete authored spawn populations and fixed placement tables, without a live spawn owner. */
export type AuthorSpawnTables = SpawnTables;
/** One player start in the ordinary scene graph; position is feet and rotation faces local -Z. */
export class PlayerStart extends Object3D {
    constructor() { super(); this.name = 'player'; }
}
/** One authored creature or actor placement. The kind names an independently declared species or actor row. */
export class Spawn extends Object3D {
    /** The independently declared species or actor identity. */
    kind: string;
    constructor(kind = '') { super(); this.kind = kind; }
    /** Clone the kind together with its standard three.js transform. */
    override copy(source: this, recursive = true): this { super.copy(source, recursive); this.kind = source.kind; return this; }
}
/** The existing player/actor placement convention, read from a world transform. */
export interface SpawnPlacement {
    x: number;
    y: number;
    z: number;
    yaw: number;
}
/** Spawn admission refuses a tilted or scaled frame; bodies own their declared dimensions. */
export function spawnPlacement(object: PlayerStart | Spawn): SpawnPlacement {
    updateAuthoringMatrix(object);
    const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
    object.matrixWorld.decompose(position, rotation, scale);
    const composed = new Matrix4().compose(position, rotation, scale);
    if (object.matrixWorld.elements.some((value, index) => !Number.isFinite(value) || Math.abs(value - (composed.elements[index] ?? Infinity)) > 1e-8))
        throw new Error('Spawn requires an unsheared affine transform');
    if (![...position, ...rotation, ...scale].every(Number.isFinite) || Math.abs(rotation.x) > 1e-8 || Math.abs(rotation.z) > 1e-8 || scale.distanceTo(new Vector3(1, 1, 1)) > 1e-8)
        throw new Error('Spawn requires finite upright unscaled placement');
    const forward = new Vector3(0, 0, 1).applyQuaternion(rotation);
    return { x: position.x, y: position.y, z: position.z, yaw: object.matrixAutoUpdate && (object.parent === null || object.parent.matrixWorld.equals(new Matrix4())) && object.rotation.x === 0 && object.rotation.z === 0 ? object.rotation.y : Math.atan2(forward.x, forward.z) };
}
