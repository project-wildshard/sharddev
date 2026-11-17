import { BufferGeometry, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { updateAuthoringMatrix } from './sceneTransform';
/** Authored contact material; the compiler writes this tag without installing a physics service. */
export type Surface = 'wood' | 'stone' | 'grass' | 'sand' | 'rock' | 'metal' | 'earth' | 'felt';
/** JSON-only position in metres. */
export interface ColliderPoint {
    x: number;
    y: number;
    z: number;
}
/** JSON-only unit quaternion, using three.js axis and component conventions. */
export interface ColliderRotation {
    x: number;
    y: number;
    z: number;
    w: number;
}
interface Placed extends ColliderPoint {
    rot?: ColliderRotation;
    surface?: Surface;
}
/** An existing authored box row, including its optional yaw or quaternion representation. */
export interface BoxColliderData extends Placed {
    kind: 'box';
    hx: number;
    hy: number;
    hz: number;
    yaw?: number;
}
/** Build-time collider description. Geometry arrays are plain data, never Rapier handles. */
export type ColliderData = BoxColliderData | Placed & {
    kind: 'capsule';
    halfHeight: number;
    radius: number;
} | Placed & {
    kind: 'hull';
    points: number[];
} | Placed & {
    kind: 'trimesh';
    vertices: number[];
    indices: number[];
};
function positive(...values: number[]): void {
    if (values.some(value => !Number.isFinite(value) || value <= 0))
        throw new Error('Collider dimensions must be finite and positive');
}
/** A physics declaration in an ordinary three.js scene. Name the object for its stable authoring identity. */
export abstract class Collider extends Object3D {
    /** Optional contact tag; undefined leaves the host default unchanged. */
    surface: Surface | undefined;
    protected constructor(surface?: Surface) { super(); this.surface = surface; }
    /** Copy authoring tags with the ordinary three.js transform and children. */
    override copy(source: this, recursive = true): this { super.copy(source, recursive); this.surface = source.surface; return this; }
    /** Read the actual world transform, rejecting shear and reflected or collapsed axes. */
    protected placement(): {
        placed: Placed;
        scale: Vector3;
    } {
        updateAuthoringMatrix(this);
        const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
        this.matrixWorld.decompose(position, rotation, scale);
        if (this.matrixAutoUpdate && (this.parent === null || this.parent.matrixWorld.equals(new Matrix4()))) {
            rotation.copy(this.quaternion);
            scale.copy(this.scale);
        }
        const composed = new Matrix4().compose(position, rotation, scale);
        if (this.matrixWorld.elements.some((value, index) => !Number.isFinite(value) || Math.abs(value - (composed.elements[index] ?? Infinity)) > 1e-8))
            throw new Error('Collider requires a finite, unsheared transform');
        positive(scale.x, scale.y, scale.z);
        if (Math.abs(rotation.lengthSq() - 1) > 1e-8)
            throw new Error('Collider requires a unit rotation');
        return { placed: { x: position.x, y: position.y, z: position.z,
                ...(rotation.x === 0 && rotation.y === 0 && rotation.z === 0 && rotation.w === 1 ? {} : { rot: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w } }),
                ...(this.surface === undefined ? {} : { surface: this.surface }) }, scale };
    }
    /** Emit one transformed collider, without changing the scene or its geometry. */
    abstract toColliderData(): ColliderData;
}
/** Box dimensions are full width, height and depth, like three.js BoxGeometry. */
export class BoxCollider extends Collider {
    private rotationEncoding: 'auto' | 'yaw' | 'quaternion' = 'auto';
    /** Full authored dimensions in metres. */
    width: number;
    /** Full authored dimensions in metres. */
    height: number;
    /** Full authored dimensions in metres. */
    depth: number;
    constructor(width = 1, height = 1, depth = 1, surface?: Surface) {
        super(surface);
        positive(width, height, depth);
        this.width = width; this.height = height; this.depth = depth;
    }
    /** Adopt an existing authoring row as a real Object3D, retaining its rotation encoding for byte-stable migration. */
    static fromData(row: BoxColliderData): BoxCollider {
        if (row.rot !== undefined && row.yaw !== undefined)
            throw new Error('Box cannot declare both yaw and quaternion');
        const collider = new BoxCollider(row.hx * 2, row.hy * 2, row.hz * 2, row.surface);
        collider.position.set(row.x, row.y, row.z);
        if (row.rot !== undefined) {
            collider.quaternion.set(row.rot.x, row.rot.y, row.rot.z, row.rot.w);
            collider.rotationEncoding = 'quaternion';
        }
        else if (row.yaw !== undefined) {
            collider.rotation.y = row.yaw;
            collider.rotationEncoding = 'yaw';
        }
        return collider;
    }
    /** Clone the same dimensions, tag and hierarchy, like a three.js Mesh. */
    override copy(source: this, recursive = true): this { super.copy(source, recursive); this.width = source.width; this.height = source.height; this.depth = source.depth; this.rotationEncoding = source.rotationEncoding; return this; }
    /** Convert full dimensions to world-space half extents. */
    override toColliderData(): BoxColliderData {
        positive(this.width, this.height, this.depth);
        const { placed, scale } = this.placement();
        const row: BoxColliderData = { kind: 'box', ...placed, hx: this.width * scale.x / 2, hy: this.height * scale.y / 2, hz: this.depth * scale.z / 2 };
        if (this.rotationEncoding === 'quaternion' && row.rot === undefined)
            row.rot = { x: 0, y: 0, z: 0, w: 1 };
        if (this.rotationEncoding === 'yaw') {
            if (row.rot !== undefined && (Math.abs(row.rot.x) > 1e-8 || Math.abs(row.rot.z) > 1e-8))
                throw new Error('Yaw-encoded box must remain upright');
            row.yaw = this.matrixAutoUpdate && (this.parent === null || this.parent.matrixWorld.equals(new Matrix4())) ? this.rotation.y : 2 * Math.atan2(row.rot?.y ?? 0, row.rot?.w ?? 1);
            delete row.rot;
        }
        return row;
    }
}
/** Capsule radius and straight length follow three.js CapsuleGeometry; the caps add two radii. */
export class CapsuleCollider extends Collider {
    /** Radius of both caps in metres. */
    radius: number;
    /** Straight cylinder length in metres. */
    length: number;
    constructor(radius = 0.5, length = 1, surface?: Surface) {
        super(surface);
        positive(radius);
        if (!Number.isFinite(length) || length < 0)
            throw new Error('Capsule length must be finite and nonnegative');
        this.radius = radius; this.length = length;
    }
    /** Clone the same radius and straight length without constructing a physics body. */
    override copy(source: this, recursive = true): this { super.copy(source, recursive); this.radius = source.radius; this.length = source.length; return this; }
    /** A circular capsule refuses ununiform scale instead of approximating an ellipse. */
    override toColliderData(): ColliderData {
        positive(this.radius);
        if (!Number.isFinite(this.length) || this.length < 0)
            throw new Error('Capsule length must be finite and nonnegative');
        const { placed, scale } = this.placement();
        if (Math.abs(scale.x - scale.z) > 1e-8 || Math.abs(scale.x - scale.y) > 1e-8)
            throw new Error('Capsule requires uniform scale');
        return { kind: 'capsule', ...placed, halfHeight: this.length * scale.y / 2, radius: this.radius * scale.x };
    }
}
function positions(geometry: BufferGeometry, scale: Vector3): number[] {
    const attribute = geometry.getAttribute('position');
    if (!geometry.hasAttribute('position') || attribute.itemSize !== 3 || attribute.count === 0)
        throw new Error('Collider geometry requires three-component positions');
    const points: number[] = [];
    for (let i = 0; i < attribute.count; i++)
        points.push(attribute.getX(i) * scale.x, attribute.getY(i) * scale.y, attribute.getZ(i) * scale.z);
    if (points.some(value => !Number.isFinite(value)))
        throw new Error('Collider geometry requires finite positions');
    return points;
}
/** A convex collider uses the authored geometry positions; hull construction belongs to the physics compiler. */
export class HullCollider extends Collider {
    /** The authored geometry, shared like a three.js Mesh geometry. */
    geometry: BufferGeometry;
    constructor(geometry: BufferGeometry = new BufferGeometry(), surface?: Surface) { super(surface); this.geometry = geometry; }
    /** Copy references to authored geometry, exactly as Mesh.copy does. */
    override copy(source: this, recursive = true): this { super.copy(source, recursive); this.geometry = source.geometry; return this; }
    /** Preserve every authored vertex while applying world scale once. */
    override toColliderData(): ColliderData {
        const { placed, scale } = this.placement(), points = positions(this.geometry, scale);
        if (points.length < 12)
            throw new Error('Hull requires at least four points');
        return { kind: 'hull', ...placed, points };
    }
}
/** An exact triangle collider uses the same BufferGeometry a Mesh can draw. */
export class MeshCollider extends Collider {
    /** The authored geometry, shared like a three.js Mesh geometry. */
    geometry: BufferGeometry;
    constructor(geometry: BufferGeometry = new BufferGeometry(), surface?: Surface) { super(surface); this.geometry = geometry; }
    /** Copy references to authored geometry, exactly as Mesh.copy does. */
    override copy(source: this, recursive = true): this { super.copy(source, recursive); this.geometry = source.geometry; return this; }
    /** Indexed and nonindexed triangles retain their original order and winding. */
    override toColliderData(): ColliderData {
        const { placed, scale } = this.placement(), vertices = positions(this.geometry, scale), count = vertices.length / 3;
        const index = this.geometry.getIndex(), indices = index === null ? Array.from({ length: count }, (_, i) => i) : Array.from({ length: index.count }, (_, i) => index.getX(i));
        if (indices.length % 3 !== 0 || indices.some(value => !Number.isSafeInteger(value) || value < 0 || value >= count))
            throw new Error('Mesh collider requires valid triangle indices');
        return { kind: 'trimesh', ...placed, vertices, indices };
    }
}
