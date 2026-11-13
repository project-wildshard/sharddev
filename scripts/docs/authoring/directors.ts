import { Director } from '@wildshard/sdk/director';
import { generateDirectorAbi } from '@wildshard/sdk/directorAbi';
import { Scene } from 'three';
import { readScene } from '@wildshard/sdk/scene';

/** The actual Template 1 door/wave declaration, with the host-provided flags. */
export function directorsExample() {
  const director = new Director({
    id: 'template.door-wave',
    inputs: { doorOpen: 'flag:template.door-open', waveDead: 'flag:template.blob' },
    stages: [
      { id: 'door' },
      { id: 'wave', when: 'doorOpen', do: [{ flag: { key: 'template.wave-started', value: true } }] },
      { id: 'complete', when: 'waveDead', do: [{ flag: { key: 'template.wave-complete', value: true } }] },
    ],
  });
  const scene = new Scene(); director.attachTo(scene);
  return { row: director.toJSON(), assemblyScript: generateDirectorAbi(director.toJSON()), scene: readScene(scene) };
}

/** Observe the declared look clock's dusk interval without author-side ticks or arithmetic. */
export function dayDirectorExample() {
  return new Director({ id: 'outpost.dusk', inputs: { dusk: 'day:0.75..0.84' }, stages: [
    { id: 'waiting' }, { id: 'lit', when: 'dusk', do: [{ flag: { key: 'outpost.beacon-ready', value: true } }] },
  ] }).toJSON();
}

/** Supported handoff: a director requests a declared flag; the existing quest owner completes it. */
export function beaconRequestExample() {
  const director = new Director({ id: 'outpost.beacon', inputs: { dusk: 'day:0.75..0.84' }, stages: [
    { id: 'waiting' }, { id: 'requested', when: 'dusk', do: [{ flag: { key: 'outpost.beacon-request', value: true } }] },
  ] });
  const quests = { flags: ['outpost.beacon-request', 'outpost.beacon-complete'], triggers: [], dialogue: [], quests: [{
    id: 'outpost.beacon', title: 'Light the beacon', completeFlag: 'outpost.beacon-complete',
    steps: [{ id: 'request', objective: 'Request the beacon at dusk', done: { all: ['outpost.beacon-request'] } }],
    onComplete: { fact: 'outpost.beacon-lit' },
  }] };
  return { director: director.toJSON(), quests, unsupported: director.dataHostIssues() };
}
