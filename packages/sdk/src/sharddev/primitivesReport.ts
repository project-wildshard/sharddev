// meta ONE-FORMAT OF17c (J365 (6), Q-T22 (b)): no host list ships; the server derives the primitives from the shard
// file's sections, and the report card prints the same list so an author sees what their data switched on.
import { derivePrimitives } from '@wildshard/format/primitives';
import { sectionSchemaVersion } from '@wildshard/format/sectionVersions';

/** The primitives `sections` switch on, in the format's table order; a family at a section version past 1 says `@N`. */
export function primitiveReportLine(sections: ReadonlyMap<string, unknown>, index: readonly { readonly name: string; readonly schema: string }[]): string {
  const versions = new Map(index.flatMap(({ name, schema }): [string, number][] => {
    const version = sectionSchemaVersion(name, schema);
    return version === undefined ? [] : [[name, version]];
  }));
  return derivePrimitives(sections, versions).map(({ name, version }) => (version > 1 ? `${name}@${String(version)}` : name)).join(', ');
}
