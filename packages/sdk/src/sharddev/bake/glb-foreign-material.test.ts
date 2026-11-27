import { expect, test } from 'vitest';
import { BoxGeometry, MeshBasicMaterial, MeshStandardMaterial, Texture } from 'three';
import { hasTexture, staticGlb, unlit } from './glb';

// SF7c: a generator's three can be a different copy of the same version from the SDK's (a linked SDK), so its materials
// fail the SDK's `instanceof`; this stands one in: the same own fields, another prototype.
const foreign = <T extends object>(material: T): T => Object.setPrototypeOf(material, Object.prototype) as T;

function glbJson(bytes: Uint8Array): { materials: { extensions?: Record<string, unknown>; pbrMetallicRoughness: { metallicFactor: number; roughnessFactor: number } }[]; extensionsUsed?: string[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as ReturnType<typeof glbJson>;
}

test('another three copy\'s unlit material bakes unlit, not refused as textured or written lit', () => {
  const material = foreign(new MeshBasicMaterial({ color: 0x336699 }));
  expect(material instanceof MeshBasicMaterial).toBe(false);
  expect(unlit(material)).toBe(true);
  expect(hasTexture(material)).toBe(false);
  const json = glbJson(staticGlb([{ geometry: new BoxGeometry(), material }], 'foreign'));
  expect(json.materials[0]?.extensions).toEqual({ KHR_materials_unlit: {} });
  expect(json.materials[0]?.pbrMetallicRoughness).toMatchObject({ metallicFactor: 0, roughnessFactor: 1 });
  expect(json.extensionsUsed).toContain('KHR_materials_unlit');
});

test('another three copy\'s lit material bakes lit, and a texture on either is refused with the J525 rule', () => {
  const lit = foreign(new MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 }));
  expect(unlit(lit)).toBe(false);
  const json = glbJson(staticGlb([{ geometry: new BoxGeometry(), material: lit }], 'foreign'));
  expect(json.materials[0]?.pbrMetallicRoughness).toMatchObject({ metallicFactor: 0.2, roughnessFactor: 0.4 });
  const mapped = new MeshBasicMaterial({ map: new Texture() }), normal = foreign(new MeshStandardMaterial({ normalMap: new Texture() }));
  expect(() => staticGlb([{ geometry: new BoxGeometry(), material: mapped }])).toThrow('GLB textures must be separate image declarations: a shardfile carries images and the cook encodes them (J525)');
  expect(() => staticGlb([{ geometry: new BoxGeometry(), material: normal }])).toThrow('(J525)');
});
