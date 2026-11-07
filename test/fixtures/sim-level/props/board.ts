import { AmbientLight, BoxGeometry, Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer, RGBA_ASTC_4x4_Format, REVISION } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { Scope } from '../../../../src/shared/engine/app/scope';
import { installDeclaredProps } from '../../../../src/client/engine/world/declaredProps';
import { PropsSchema } from '@wildshard/format/props';
import * as v from 'valibot';
import { templateProps } from '../../../../src/shards/_template/generators/templatePropsSource';

const scene = new Scene(); scene.background = new Color(0x20252c);
const renderer = new WebGLRenderer({ antialias: true }); renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const camera = new PerspectiveCamera(48, innerWidth / innerHeight, 0.05, 1000), sun = new DirectionalLight(0xffffff, 3); sun.position.set(10, 30, 10); scene.add(sun, new AmbientLight(0xffffff, 1));
const floor = new Mesh(new BoxGeometry(500, 0.1, 500), new MeshStandardMaterial({ color: 0x484848 })); floor.position.y = -0.05; scene.add(floor);
const fixture = templateProps(10), baked = new Group(), scope = new Scope('props.board'), family = new MeshStandardMaterial(); scene.add(fixture.original, baked);
const props = v.parse(PropsSchema, await (await fetch('./props.json')).json()), refs = new Set([...props.tiles.map((t) => t.file), ...props.panels.map((t) => t.file), ...props.models.map((t) => t.file), ...(props.far === null ? [] : [props.far])]);
const assets = new Map(await Promise.all([...refs].map(async (hash) => [hash, new Uint8Array(await (await fetch(`./${hash}`)).arrayBuffer())] as const)));
const installed = await installDeclaredProps(props, { scene: baked, scope, assets, materials: new Map([['pbr', family]]) });
const farInstalled = await installDeclaredProps(props, { scene: baked, scope, assets, materials: new Map([['pbr', family]]), lod: 'far', includeLibrary: false });
const originalGear = new Group(), bakedGear = new Group(); originalGear.add(fixture.source.models?.[0]?.model.clone() ?? new Group()); bakedGear.add(installed.models.get('template.lantern') ?? new Group()); scene.add(originalGear, bakedGear);
const poses = { hut: { at: [0, 5, 3], look: [0, 1, -12] }, scatter: { at: [23, 12, 37], look: [0, 0, 14] }, course: { at: [98, 35, 8], look: [90, 30, -4] }, lantern: { at: [0.4, 0.2, 0.6], look: [0, 0, 0] } } as const;
async function select(mode: 'original' | 'baked' | 'far', pose: keyof typeof poses): Promise<void> {
  fixture.original.visible = mode === 'original' && pose !== 'lantern'; baked.visible = mode !== 'original' && pose !== 'lantern'; originalGear.visible = mode === 'original' && pose === 'lantern'; bakedGear.visible = mode !== 'original' && pose === 'lantern'; floor.visible = pose !== 'lantern';
  for (const [id, panel] of installed.panels) panel.visible = mode === 'baked' && (id !== 'template.jump' || pose === 'course');
  for (const [key, tile] of installed.tiles) tile.visible = mode === 'baked' && key.startsWith('0/'); if (farInstalled.far !== null) farInstalled.far.visible = mode === 'far';
  const target = poses[pose]; camera.position.set(target.at[0], target.at[1], target.at[2]); camera.lookAt(target.look[0], target.look[1], target.look[2]); renderer.render(scene, camera); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); renderer.render(scene, camera);
}
function diagnostic(): { renderer: string; batched: number } {
  const gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info'); const name: unknown = extension === null ? '' : gl.getParameter(extension.UNMASKED_RENDERER_WEBGL); let batched = 0; scene.traverse((o) => { if ('isBatchedMesh' in o && o.isBatchedMesh === true) batched++; }); return { renderer: typeof name === 'string' ? name : '', batched };
}
const textureLoader = new KTX2Loader().setTranscoderPath(`/basis/r${REVISION}/`).detectSupport(renderer);
async function texture(): Promise<{ astc: boolean; format: number; mipBytes: number; width: number; height: number; uploadError: number }> {
  const t = await textureLoader.loadAsync('./checker.ktx2'); renderer.initTexture(t); const uploadError = renderer.getContext().getError();
  const bytes = t.mipmaps.reduce((n, mip) => n + mip.data.byteLength, 0); const result = { astc: t.format === RGBA_ASTC_4x4_Format, format: t.format, mipBytes: bytes, width: t.image.width, height: t.image.height, uploadError }; t.dispose(); return result;
}
declare global { interface Window { propsFixture: { select: typeof select; texture: typeof texture; diagnostic: typeof diagnostic; ready: boolean } } }
window.propsFixture = { select, texture, diagnostic, ready: true }; await select('original', 'hut');
addEventListener('pagehide', () => { scope.dispose(); fixture.dispose(); textureLoader.dispose(); renderer.dispose(); });
