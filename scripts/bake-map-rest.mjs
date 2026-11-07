// Emit a declared scene's initial presentation using the browser's own CPU
// channel projection. No renderer, physics, runtime installation or clock.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BufferGeometry, Group, InstancedMesh, MeshBasicMaterial } from 'three';
import { createClientChannelView, moverChannelValues } from '@wildshard/engine/game/plugin/clientChannelView';

export function mapRest(scene, programs, poses) {
  const targets = new Map(), coverage = new Map(), nodes = {}, movers = new Map(poses.map(pose => [pose.id, pose]));
  const geometry = new BufferGeometry(), material = new MeshBasicMaterial();
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
  try {
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
    for (const [id, target] of targets) {
      nodes[id] = { position: target.position.toArray(), quaternion: target.quaternion.toArray(), scale: target.scale.toArray(), visible: target.visible,
        ...(target instanceof InstancedMesh ? { matrices: Array.from(target.instanceMatrix.array) } : {}) };
    }
    return { version: 1, nodes };
  } finally { geometry.dispose(); material.dispose(); }
}

if (process.argv[1] === import.meta.filename) {
  const arg = process.argv.find(value => value.startsWith('--config='));
  if (arg === undefined) throw new Error('Map rest requires --config=declared.json');
  const configPath = resolve(arg.slice(9)), base = dirname(configPath), config = JSON.parse(readFileSync(configPath, 'utf8'));
  const read = file => JSON.parse(readFileSync(resolve(base, file), 'utf8'));
  const scene = read(config.scene), motion = read(config.motion), output = resolve(base, config.output);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(mapRest(scene.scene ?? scene, motion.channels, motion.rest))}\n`);
}
