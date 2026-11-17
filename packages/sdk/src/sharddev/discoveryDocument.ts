import type { DiscoveryValues } from '@wildshard/format/discoveryValues';

/** C3 (J61): what a page needs of a shard before its product admits, as data in the product. `data` is the packed `ui/level`
 *  manifest; `rows` and `native` are what its bindings resolve to, with `{$call}` naming a game function the reader applies
 *  (`src/client/game/shard/discovery.ts`). A binding that needs a shard's own code at runtime has no row here and refuses. */
export interface DiscoveryCall {readonly $call: string; readonly args: readonly unknown[]}
export interface DiscoveryDocument {
  readonly version: 1;
  readonly slug: string;
  readonly data: unknown;
  readonly rows: Readonly<Record<string, unknown>>;
  readonly native: Readonly<Record<string, unknown>>;
  /** Each image URL the manifest names and its bytes, for a boot's download totals. */
  readonly art?: Readonly<Record<string, number>>;
}
/** A binding's module export: `(module, export)`, read from the author's project. */
export type ProjectValue = (module: string, name: string) => Promise<unknown>;
export const discoveryUrl = (folder: string): string => `/shardfiles/${folder}/discovery.json`;

type Row = Readonly<Record<string, unknown>>;
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const call = ($call: string, ...args: readonly unknown[]): DiscoveryCall => ({$call, args});
const SAMPLED = ['runtimeCost', 'mapPalette', 'poses', 'groundRows', 'groundColourSamples', 'surfaceSamples', 'forestMaskSamples', 'mapGroundSamples', 'navmesh'] as const;
const BOOT = ['files', 'sources', 'lateReads', 'bakedUnread', 'explore'] as const;

/** The manifest's bindings as data: `read` stands where a generated module's import stood. */
export async function discoveryDocument(slug: string, data: unknown, values: DiscoveryValues | undefined, read: ProjectValue): Promise<DiscoveryDocument> {
  if (!isRow(data) || !isRow(data['bindings'])) throw new Error(`${slug}: discovery needs a level manifest with bindings`);
  const b = data['bindings'], rows: Record<string, unknown> = {accent: b['accent']}, native: Record<string, unknown> = {};
  const row = (key: string): Row | undefined => { const value = b[key]; return isRow(value) ? value : undefined; };
  const text = (value: unknown, label: string): string => { if (typeof value !== 'string') throw new Error(`${slug}: ${label} needs a name`); return value; };
  const value = (ref: unknown, key?: string): Promise<unknown> => {
    if (isRow(ref) && ref['program'] === true) {
      if (key === undefined || values === undefined || !Object.hasOwn(values, key)) throw new Error(`${slug}: no program value ${key ?? ''}`);
      return Promise.resolve(Reflect.get(values, key));
    }
    if (!isRow(ref)) throw new Error(`${slug}: invalid binding ${key ?? ''}`);
    return read(text(ref['module'], 'a binding'), text(ref['export'] ?? 'default', 'a binding'));
  };
  rows['budgets'] = await value(b['budgets'], 'budgets');
  for (const key of SAMPLED) if (b[key] !== undefined) rows[key] = await value(b[key], key);
  const forest = row('forestQueries');
  if (forest?.['platform'] === 'fixed') rows['forestQueries'] = call('forestFixed', forest);
  else if (forest?.['platform'] === 'declared') rows['forestRows'] = await value(forest['rows'], 'forestQueries.rows');
  else if (forest !== undefined) rows['forestQueries'] = await value(forest, 'forestQueries');
  const pond = row('pondClip');
  if (pond?.['platform'] === 'declared') rows['pondClip'] = call('pondDeclared', await value(pond['rows'], 'pondClip.rows'));
  else if (pond !== undefined) rows['pondClip'] = await value(pond, 'pondClip');
  if (b['spawns'] !== undefined) rows['spawns'] = await value(b['spawns'], 'spawns');
  if (b['navigation'] !== undefined) {
    const held = await value(b['navigation'], 'navigation');
    if (!isRow(held)) throw new Error(`${slug}: invalid navigation`);
    rows['navigation'] = {row: held['navigation'], url: held['url']};
  }
  if (b['audioPreload'] !== undefined) throw new Error(`${slug}: an audio preload is shard code`);
  if (b['audioCues'] !== undefined) rows['audioBindings'] = {cues: await value(b['audioCues'], 'audioCues')};
  const sword = row('sword');
  if (sword?.['platform'] === 'graph') rows['sword'] = call('swordGraph', slug, sword['file']);
  else if (sword?.['rows'] !== undefined) rows['sword'] = call('swordRows', await value({module: sword['rows']}));
  else if (sword !== undefined) throw new Error(`${slug}: a sword factory is shard code`);
  const boot = row('boot');
  if (boot?.['platform'] === 'page-mode') rows['bootBindings'] = call('pageModeBoot', await value(boot['rows'], 'boot.pageModes'));
  else if (boot !== undefined) {
    if (boot['audio'] !== undefined) throw new Error(`${slug}: a boot audio factory is shard code`);
    const bindings: Record<string, unknown> = {};
    for (const key of BOOT) if (boot[key] !== undefined) bindings[key] = await value(boot[key], `boot.${key}`);
    rows['bootBindings'] = bindings;
  }
  const render = row('render');
  if (render?.['platform'] === 'toon') native['render'] = call('renderToon');
  else if (render?.['platform'] === 'painted') native['render'] = call('renderPainted');
  else if (render?.['platform'] === 'post') native['render'] = call('renderPost', {file: render['file'], field: render['field']});
  else if (render?.['platform'] === 'keyed') {
    const trim = await value(render['trim']);
    if (!isRow(trim)) throw new Error(`${slug}: invalid sky trim`);
    native['render'] = call('renderKeyed', {channels: render['channels'], looks: await value(render['looks']), trim: trim[text(render['trimRow'], 'a trim row')]});
  } else if (render !== undefined) throw new Error(`${slug}: a look factory is shard code`);
  const ground = row('ground');
  if (ground?.['platform'] === 'declared') native['ground'] = call('groundDeclared', await value(ground['rows'], 'ground.rows'), data['ground'] ?? {});
  else if (ground !== undefined) native['ground'] = await value(ground, 'ground');
  const roster = row('roster');
  if (roster?.['platform'] === 'held') native['roster'] = call('rosterHeld', await value({module: roster['rows']}));
  else if (roster !== undefined) throw new Error(`${slug}: a roster factory is shard code`);
  const entry = row('entry');
  if (b['load'] !== undefined) throw new Error(`${slug}: a load module is shard code`);
  if (entry !== undefined) {
    const styles = Array.isArray(entry['styles']) ? entry['styles'] : [];
    native['load'] = call('planEntry', {retainHomeRuntime: entry['retainHomeRuntime'], stagesOwner: entry['stagesOwner']},
      await Promise.all(styles.map(style => read(text(style, 'a style'), 'css'))));
  }
  const ktx2 = row('ktx2');
  if (ktx2?.['program'] === true) native['ktx2'] = {GPU_FILES: await value(ktx2, 'ktx2')};
  else if (ktx2?.['platform'] === 'page-mode') native['ktx2'] = call('pageModeKtx2', await value(ktx2['rows'], 'ktx2.pageModes'));
  else if (ktx2 !== undefined) native['ktx2'] = {GPU_FILES: await value({module: ktx2['module'], export: ktx2['export'] ?? 'GPU_FILES'}, 'ktx2')};
  if (b['posesLoader'] !== undefined) throw new Error(`${slug}: a poses loader is shard code`);
  return {version: 1, slug, data, rows, native};
}
