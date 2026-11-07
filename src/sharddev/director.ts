import type { parseDirector } from '@wildshard/format/director';
import { directorDataHostIssues, parseDirectorStages, type DirectorStagesData, type DirectorStagesDefinition } from '@wildshard/format/directorStages';
import { Object3D } from 'three';
import { parseChapterDirector } from '@wildshard/format/chapterDirector';

/** Admit closed chapter effects, observations and wake wiring before any entered director exists. */
export function chapterDirectorRows(input: unknown): ReturnType<typeof parseChapterDirector> { return parseChapterDirector(input); }

/** Typed director data with bounded observations, payloads and reserved grid subscriptions. */
export type DirectorData = ReturnType<typeof parseDirector>;

/** Author a bounded stage machine. Inputs name native owners; the build emits rows without installing gameplay. */
export class Director {
  private readonly definition: DirectorStagesData;
  constructor(definition: Omit<DirectorStagesDefinition, 'version'>) {
    this.definition = structuredClone(parseDirectorStages({ ...definition, version: 2 }));
  }
  /** Emit independent JSON data, retaining stage and action registration order. */
  toJSON(): DirectorStagesData { return structuredClone(this.definition); }
  /** Inspect stock data-only support without granting native ownership or changing admitted rows. */
  dataHostIssues(): readonly string[] { return directorDataHostIssues(this.definition); }
  /** Attach this data declaration to a named graph node for scene.json transport; never installs a stage host. */
  attachTo(parent: Object3D): Object3D {
    const object = new Object3D(); object.name = this.definition.id; object.userData['director'] = this; parent.add(object); return object;
  }
}
