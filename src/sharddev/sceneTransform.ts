import type { Object3D } from 'three';
/** Recompute authored matrices, including manually supplied local matrices, without visiting unrelated branches. */
export function updateAuthoringMatrix(object: Object3D): void {
    const ancestors: Object3D[] = [];
    let cursor: Object3D | null = object;
    while (cursor !== null) {
        ancestors.push(cursor);
        cursor = cursor.parent;
    }
    for (const ancestor of ancestors.reverse())
        ancestor.updateWorldMatrix(false, false, true);
}
