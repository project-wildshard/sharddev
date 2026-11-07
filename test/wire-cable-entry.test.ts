// @vitest-environment happy-dom
// A quest cable's page half on the wire: what it borrows, what it refuses, its prompt and its feedback. The server rides (`quest-seats`,
// `net-traversal-wire`); this page follows what it says. The flip deletes the test that drove a cable with the page's own mode.
import { expect, test } from 'vitest';
import { BoxGeometry, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { WorldRegistry } from '../src/client/engine/world/registry';
import { installCableModes } from '../src/shared/engine/player/modes';
import { ZiplineDriver } from '../src/shared/engine/sim/cableTraversal';
import { prepareQuestEntry } from '../src/client/game/quest/chapter';
import { wirePage } from '../src/client/game/shardfile/wirePage';
import { shardContext } from '../src/client/game/plugin/context';
import { parseShardSlug } from '../src/shared/game/shard/slug';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { fixtureProductFile, fixtureJsonCheck } from './fixtures/productFile';
import { installWorldScenes } from '../src/client/game/shardfile/worldScenes';
import { parseWorldScenes } from '@wildshard/format/worldScenes';
import { staticGlb } from '../src/sharddev/bake/glb';
import { MANIFEST as TEMPLATE } from '../src/shards/_template/discovery.generated';
import { DRIFTWOOD as drift } from './fixtures/driftwood-program';
import { PAGE_STORY as story } from '../src/shards/driftwood-isle/generators/pageStory';
import { DRIFTWOOD_MODES } from '../src/shards/driftwood-isle/generators/modes';
import { PINE_MODES } from '../src/shards/pine-hollow/generators/zipline';

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const section = parseWorldScenes({ version: 1, catalogue: 'catalogue.json',
  placements: [{ id: 'cable.placement', model: 'line', draw: 'merged',
    drawnInto: { part: 'cable.root', boxes: [-1, -1, -1, 1, 1, 1] }, poses: [{ x: 0, y: 0, z: 0, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }] }],
  libraries: [{ kind: 'owned', id: 'cable', models: [{ id: 'carriage', file: 'carriage.glb' }] }],
  materials: [{ kind: 'standard', id: 'body', properties: {} }],
  steps: [{ id: 'cable', scene: 'scene.json', geometry: { carriage: { library: 'cable', model: 'carriage' } }, materials: { body: 'body' },
    publish: { carriage: { kind: 'mesh', part: 'carriage' }, prompt: { kind: 'vector', value: [3, 7, 9] } } }] });
const recipe = { scene: { version: 1, root: 'root', nodes: [{ kind: 'group', id: 'root', children: ['carriage'] },
  { kind: 'mesh', id: 'carriage', geometry: 'carriage', material: 'body', missing: 'empty' }],
  materials: [{ kind: 'port', id: 'body', source: 'body' }] }, imports: [] };

test('a cable on the wire borrows its mode, trolley and scene, and follows the server\'s ride', async () => {
  let led = false;
  for (const modes of [PINE_MODES, DRIFTWOOD_MODES]) {
    led = false; wirePage.led = () => led; Object.defineProperty(wirePage, 'on', { get: () => true, configurable: true }); // the flip makes this the only page
    const scope = new Scope('quest-cable-entry'), host = new App(), scene = new Scene(), camera = new PerspectiveCamera();
    const shape = new BoxGeometry(), material = new MeshStandardMaterial();
    const files = new Map([['quests/story.json', encode(story)], ['quests/services.json', encode({ version: 1, actions: [] })],
      ['scene.json', encode(recipe)], ['catalogue.json', encode({ product: drift.identity.slug, models: [{ key: 'line', id: `${drift.identity.slug}/line`, name: 'Cable line', category: 'props', pipeline: 'code', file: 'catalogue.json', defaults: {}, choices: [{ id: 'only', params: {}, size: [1, 1, 1], colliders: [], draws: [{ id: 'carriage', library: 'cable', model: 'carriage', material: 'body' }] }] }] })], ['carriage.glb', staticGlb([{ geometry: shape, material }])]]);
    shape.dispose(); material.dispose();
    const product = createShardProduct({ slug: drift.identity.slug, revision: 1, shardfile: drift, jsonCheck: fixtureJsonCheck,
      sections: new Map([['world/scenes', section]]), files: new Map([...files.keys()].map(name => [name, fixtureProductFile(name, { hash: name, url: name })])),
      read: name => { const value = files.get(name); return value === undefined ? Promise.reject(new Error('Missing fixture file')) : Promise.resolve(value); } });
    const level = createLevelInstallation(host, scope, {}, () => ({ set: () => undefined, detail: () => undefined }));
    const ctx = shardContext(level.context, { ...TEMPLATE, slug: parseShardSlug(drift.identity.slug) },
      { shard: TEMPLATE, rows: new Map(), bag: { tab: () => () => undefined, fragment: () => () => undefined } }, product);
    const player = { position: new Vector3(), velocity: new Vector3(), yaw: 0, pitch: 0, platforms: [] };
    const feedback: string[] = [], enabled: boolean[] = [];
    const weapons = { visible: true, setEnabled: (on: boolean) => { enabled.push(on); } };
    const play = { weapons, audio: { voices: { play: (id: string) => { feedback.push(id); } } }, hud: { toast: (text: string) => { feedback.push(text); } } };
    const prompts: ReturnType<ReturnType<typeof installCableModes>['bindView']>[] = [];
    Object.defineProperty(ctx.game, 'runtime', { value: { world: { player, registry: new WorldRegistry(), game: { scene, camera }, sky: { setupMaterial: () => undefined } }, play, objects: {}, interactables: prompts } });
    try {
      const entry = await prepareQuestEntry(ctx, { story: 'quests/story.json', services: 'quests/services.json', placement: {} });
      const modesOwner = installCableModes(scope, modes.traverse, entry.flags), mode = modes.traverse[0];
      if (mode === undefined) throw new Error('Missing authored cable');
      const scenes = await installWorldScenes(ctx, section), trolley = scenes.mesh('cable.carriage');
      const rows = { mode: mode.id, carriage: 'cable.carriage', scene: modes === PINE_MODES ? { kind: 'object', id: 'cable.root' } : { kind: 'placement', id: 'cable.placement' },
        prompt: modes === PINE_MODES ? { x: 3, y: 7, z: 9 } : 'cable.prompt', radius: 2.4, label: 'Ride', camera: modes === PINE_MODES,
        feedback: { weapons: modes === PINE_MODES ? 'enabled' : 'visible', start: { sound: 'lever', at: 'cable.prompt' },
          end: { sound: 'plate', at: { x: 3, y: 7, z: 9 } }, arrival: 'Arrived' } };
      await expect(entry.cable({ ...rows, mode: 'missing' })).rejects.toThrow('Unknown cable mode');
      await expect(entry.cable({ ...rows, prompt: () => new Vector3() })).rejects.toThrow('JSON rows');
      await expect(entry.cable({ ...rows, feedback: { ...rows.feedback, shot: { audio: 'missing', family: 'zipline', at: 'cable.prompt' } } })).rejects.toThrow('declared sound bank');
      expect(prompts).toEqual([]); expect(scene.children).toEqual([]);
      const view = await entry.cable(rows);
      expect(view.cables).toBe(modesOwner); expect(view.trolley).toBe(trolley);
      expect(view.group).toBe(scenes.object('cable.root')); expect(trolley.parent).toBe(view.group);
      if (modes === PINE_MODES) expect(view.placed).toBeNull();
      else expect(view.placed).toBe(await scenes.place('cable.placement')); expect(view.prompt.position.toArray()).toEqual([3, 7, 9]);
      expect(prompts).toEqual([view.prompt]); expect(scene.children).toEqual([view.group]);
      expect(view.prompt.wireId, 'a press asks the server by the cable\'s mode').toBe(mode.id);
      const rest = trolley.position.toArray();
      const wire = new ZiplineDriver(modesOwner.declaration(mode.id)), hang = (s: number): void => { wire.rider(s, player.position); };
      led = true; hang(1); view.update(.1);
      expect(modesOwner.state(mode.id).riding).toBe(true); expect(view.prompt.radius, 'no prompt under a rider').toBe(0);
      hang(wire.len / 2); view.update(.1);
      expect(trolley.position.toArray(), 'the carriage goes where the server carries the body').not.toEqual(rest);
      expect(weapons.visible).toBe(false); expect(feedback).toEqual(['ui-lever']);
      expect(enabled).toEqual(modes === PINE_MODES ? [false] : []);
      view.update(.1); expect(feedback, 'a ride starts once').toEqual(['ui-lever']);
      led = false; hang(wire.len); view.update(.1);
      expect(modesOwner.state(mode.id).riding).toBe(false);
      expect(weapons.visible).toBe(true); expect(feedback).toEqual(['ui-lever', 'ui-plate', 'Arrived']);
      expect(enabled).toEqual(modes === PINE_MODES ? [false, true] : []);
      expect(view.cables.takeTransitions(mode.id)).toEqual([]);
      await expect(entry.cable(rows)).rejects.toThrow('already bound');
      expect(prompts).toEqual([view.prompt]);
      scope.dispose(); expect(scene.children).toEqual([]);
      view.update(1); expect(feedback).toEqual(['ui-lever', 'ui-plate', 'Arrived']);
      await expect(entry.cable(rows)).rejects.toThrow('scene admission');
    } finally { scope.dispose(); wirePage.led = () => false; Reflect.deleteProperty(wirePage, 'on'); }
  }
});
