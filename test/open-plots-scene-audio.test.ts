// @vitest-environment happy-dom
import { installAssetFixture } from './fixtures/bootSetup';
import { expect, test, vi } from 'vitest';
import { Vector3 } from 'three';
import { Audio } from '../src/client/engine/audio/Audio';
import { sfxCredit } from '../src/client/engine/audio/credits';
import { Music } from '../src/client/engine/audio/Music';
import { Scope } from '../src/shared/engine/app/scope';
import { SetScore, type ScoreSource } from '../src/client/engine/audio/SetScore';
import type { LevelAudioBank } from '../src/client/engine/audio/levelAudio';
import type { Player } from '../src/client/engine/player/Player';
import { legacyDouble } from '../src/test/engine/FakeGame';
import { AudioSceneDirector } from '../src/client/game/audio/sceneDirector';
import { parseAudioData } from '@wildshard/format/audio';
import { plotAudioData } from '../src/shards/open-plots/generators/audio';
import { nalatiAudioRows } from '../src/shards/nalati-grasslands/generators/audioRows';
import anchors from '../src/shards/open-plots/data/audioAnchors.json' with { type: 'json' };

await installAssetFixture();

class Pcm implements AudioBuffer {
  readonly sampleRate = 48000;
  readonly length = 48000;
  readonly duration = 1;
  readonly numberOfChannels = 1;
  readonly samples = new Float32Array(this.length);
  getChannelData(): Float32Array<ArrayBuffer> { return this.samples; }
  copyFromChannel(destination: Float32Array, _channel: number, offset = 0): void { destination.set(this.samples.subarray(offset, offset + destination.length)); }
  copyToChannel(source: Float32Array, _channel: number, offset = 0): void { this.samples.set(source, offset); }
}

test('the native scene waits for all six own cue loops, then releases its score and bank listeners', () => {
  const data = plotAudioData('lantern-bayou', anchors['lantern-bayou'], { dir: '/assets/music/lantern-bayou/', manifestKey: 'lantern-bayou' });
  const scope = new Scope('plot.audio.control'), audio = new Audio(), music = new Music(audio);
  let source: ScoreSource | undefined;
  const refresh = vi.spyOn(music, 'refreshScore').mockImplementation(() => { /* No device is opened in this bank-lifetime control. */ });
  vi.spyOn(music, 'setScore').mockImplementation((_id, score) => { source = score; return () => { source = undefined; }; });
  const scene = new AudioSceneDirector(data, legacyDouble<Player>({ position: new Vector3(), yaw: 0 }));
  const previousCredit = sfxCredit('synth');
  const bank: LevelAudioBank = { title: undefined, score: { slots: new Map(), stings: new Map() }, cues: { loops: new Map(), shots: new Map() } };
  try {
    scene.bind(audio, music, undefined, scope);
    expect(sfxCredit('synth')).toContain('Powered by Stability AI');
    if (!(source instanceof SetScore)) throw new Error('Missing native own score');
    expect(source.pending).toBe(true); expect(source.styleIndependent).toBe(true);
    audio.useLevelBank(bank); expect(source.pending).toBe(true);
    const ids = data.samples?.catalogue?.loopOrder; if (ids === undefined) throw new Error('Missing own loop inventory');
    const buffer = new Pcm();
    for (const id of ids.slice(0, -1)) bank.cues.loops.set(id, { buffer, loopStart: 0, loopEnd: 1, gain: 1 });
    audio.useLevelBank(bank); expect(source.pending).toBe(true);
    const final = ids.at(-1); if (final === undefined) throw new Error('Missing final loop');
    bank.cues.loops.set(final, { buffer, loopStart: 0, loopEnd: 1, gain: 1 });
    audio.useLevelBank(bank); expect(source.pending).toBe(false);
    const dispose = vi.spyOn(source, 'dispose');
    scope.dispose(); expect(sfxCredit('synth')).toBe(previousCredit); expect(source).toBeUndefined(); expect(audio.bedId).toBe('');
    expect(dispose).toHaveBeenCalledOnce();
    refresh.mockClear(); audio.useLevelBank(bank); expect(refresh).not.toHaveBeenCalled();
  } finally { scope.dispose(); }
});

test('the existing Nalati score catalogue keeps its shared sample overlay without an own-loop inventory', () => {
  const data = parseAudioData(nalatiAudioRows().audio);
  expect(data.music?.setCatalogue).toBeDefined();
  expect(data.samples?.catalogue).toBeUndefined();
  const scope = new Scope('nalati.audio.compatibility'), audio = new Audio(), music = new Music(audio);
  vi.spyOn(music, 'refreshScore').mockImplementation(() => { /* No device opens in this compatibility control. */ });
  let installed: ScoreSource | undefined;
  vi.spyOn(music, 'setScore').mockImplementation((_id, score) => { installed = score; return () => { installed = undefined; }; });
  const scene = new AudioSceneDirector(data, legacyDouble<Player>({ position: new Vector3(), yaw: 0 }));
  try {
    expect(() => scene.bind(audio, music, undefined, scope)).not.toThrow();
    expect(installed).toBeInstanceOf(SetScore); expect(installed?.styleIndependent).toBe(false);
    expect(() => audio.useLevelBank({ title: undefined, score: { slots: new Map(), stings: new Map() }, cues: { loops: new Map(), shots: new Map() } })).not.toThrow();
  } finally { scope.dispose(); }
});

test('an explicitly owned scene cue bank still refuses an empty loop inventory', () => {
  const data = plotAudioData('lantern-bayou', anchors['lantern-bayou'], { dir: '/assets/music/lantern-bayou/', manifestKey: 'lantern-bayou' });
  if (data.samples?.catalogue === undefined) throw new Error('Missing explicit sample catalogue');
  data.samples.catalogue.loopOrder = [];
  const scope = new Scope('plot.audio.invalid'), audio = new Audio();
  const scene = new AudioSceneDirector(data, legacyDouble<Player>({ position: new Vector3(), yaw: 0 }));
  try { expect(() => scene.bind(audio, undefined, undefined, scope)).toThrow('Scene cue bank requires its loop inventory'); }
  finally { scope.dispose(); }
});
