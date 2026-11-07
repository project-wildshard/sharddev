import * as THREE from 'three';
import { parsePracticeScene, parseRidingPractice, type RidingPracticeLayout, type PracticeScene, type HookPracticeLayout } from '@wildshard/format/practiceCourseRows';

/** Complete authored course parts, collision descriptions and map records. */
export type AuthorPracticeScene = PracticeScene;
/** Native practice anchors and routes; authoring keeps the whole layout grammar. */
export type AuthorHookPracticeLayout = HookPracticeLayout;
/** Complete native riding-course declaration, including controller and return program. */
export type AuthorRidingPracticeLayout = RidingPracticeLayout;
/** Admit all native course geometry, map, controller and program invariants. */
export function ridingPracticeRows(input: unknown): RidingPracticeLayout { return parseRidingPractice(input); }

type Part = PracticeScene['parts'][number];
type Tone = Extract<Part, { kind: 'box' }>['tone'];
/** Build-only developer primitive collector; no DOM, texture or GPU allocation. */
export class CourseKit {
  private readonly parts: Part[] = [];
  box(tone: Tone, x: number, y: number, z: number, sx: number, sy: number, sz: number, tint = 1): void { this.parts.push({ kind: 'box', tone, at: [x, y, z], size: [sx, sy, sz], tint }); }
  plane(tone: Tone, x: number, y: number, z: number, sx: number, sz: number): void { this.parts.push({ kind: 'plane', tone, at: [x, y, z], size: [sx, sz] }); }
  wall(tone: Tone, x: number, y: number, z: number, width: number, height: number, face: Extract<Part, { kind: 'wall' }>['face']): void { this.parts.push({ kind: 'wall', tone, at: [x, y, z], size: [width, height], face }); }
  build(name: string): THREE.Group { const root = new THREE.Group(); root.name = name; for (const part of this.parts) { const node = new THREE.Group(); node.userData['coursePart'] = part; root.add(node); } return root; }
}
/** Labels retain strings and layout; the browser paints the normal developer label texture. */
export function courseLabel(text: string, width: number, opts: { color?: string; back?: string; standing?: boolean } = {}): THREE.Group {
  const node = new THREE.Group(); node.userData['coursePart'] = { kind: 'label', text, width, ...opts }; return node;
}
/** Developer material identity; its canvas texture is reconstructed by the client. */
export function courseMaterial(tone: Tone): THREE.MeshBasicMaterial { const material = new THREE.MeshBasicMaterial(); material.name = `dev-grid:${tone}`; return material; }
/** A checker is a paint recipe rather than an embedded canvas image. */
export function courseChecker(x: number, y: number, z: number, length: number): THREE.Group { const node = new THREE.Group(); node.position.set(x, y, z); node.userData['coursePart'] = { kind: 'checker', length }; return node; }
/** Flatten a build-only scene into bounded primitive and numeric mesh rows. */
export function captureCourse(root: THREE.Group, colliders: PracticeScene['colliders'], map: PracticeScene['map']): PracticeScene {
  const parts: unknown[] = [];
  root.traverse(node => {
    const part: unknown = node.userData['coursePart'];
    if (part !== undefined && typeof part === 'object' && part !== null) {
      if ('kind' in part && (part.kind === 'label' || part.kind === 'checker')) parts.push({ ...part, at: node.position.toArray(), ...(part.kind === 'label' ? { yaw: node.rotation.y } : {}) });
      else parts.push(part);
    } else if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshBasicMaterial) {
      const geometry = node.geometry as THREE.BufferGeometry; const material = node.material;
      const attribute = (name: string): number[] => Array.from(geometry.getAttribute(name).array);
      parts.push({ kind: 'mesh', at: node.position.toArray(), rotation: [node.rotation.x, node.rotation.y, node.rotation.z], name: node.name,
        position: attribute('position'), ...(geometry.hasAttribute('uv') ? { uv: attribute('uv') } : {}),
        ...(geometry.hasAttribute('color') ? { color: attribute('color') } : {}), ...(geometry.index === null ? {} : { index: Array.from(geometry.index.array) }),
        material: { color: material.color.getHex(), ...(material.name.startsWith('dev-grid:') ? { tone: material.name.slice(9) } : {}), side: material.side, toneMapped: material.toneMapped, polygonOffset: material.polygonOffset, polygonOffsetFactor: material.polygonOffsetFactor } });
    }
  });
  return parsePracticeScene({ parts, colliders, map });
}
