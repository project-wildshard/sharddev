import { compileBehaviourModule } from '@wildshard/sdk/buildBehaviour';
import { generateDirectorAbi, generateScriptModule } from '@wildshard/sdk/directorAbi';
import { directorsExample } from './directors';

/** Compile an actual boolean accessor over Template 1's declared input ABI, without inventing a handler. */
export async function directorScriptExample() {
  const source = 'import { inputs } from "./wildshard-director";\nexport function ready(): bool { return inputs.doorOpen && !inputs.waveDead; }';
  return compileBehaviourModule(source, 1, { 'wildshard-director.ts': generateDirectorAbi(directorsExample().row) });
}

/** A complete beacon handler with typed buffers and state; actor identity comes from its native binding. */
export function numericScriptExample() {
  const state = { version: 1, sharedOwner: 'host', playerKey: 'actorId',
    shared: [{ id: 9, name: 'beacon-lit', type: 'bool', privacy: 'public', default: false }],
    player: [{ id: 3, name: 'coins', type: 'i32', privacy: 'owner', default: 0, min: 0, max: 10 }] };
  const module = generateScriptModule(state, `
    if (incomingEvents.count > 0 && incomingEvents.type(0) == 7) {
      shared.beaconLit = true;
      player.coins = player.coins + 5;
      effects.event(7, i32(clock.self), incomingEvents.value(0));
    }`);
  return { state, ...module };
}
