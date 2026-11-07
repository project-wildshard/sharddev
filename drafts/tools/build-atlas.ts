// The Atlas generator's pure half (WORLDCLAW-TOOLS W1): a draft's sources → `Atlas`. No uploads, no writes; atlas.ts
// does those. The tests drive it on fixtures.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  STAGES, isStageId, spoilerByKind, stageName, stageOrder, ticksDone,
  type Atlas, type Cam, type ConceptSub, type DraftCard, type Img, type Item, type ItemKind, type ItemStatus,
  type Mechanic, type Model, type Place, type Proto, type Round, type SetPlan, type Side, type StageEntry, type StageId,
  type Step, type Terrain, type Board, type DesignDoc,
} from '../src/atlas.ts';
import type { ImageIndex } from './images.ts';

export interface FileRule {
  match: string;
  title?: string;
  kind?: ItemKind;
  status?: ItemStatus;
  sub?: ConceptSub;
  model?: string;
  placeNum?: string;
  step?: string;
  view?: string;
  angle?: string;
  cam?: string;
  /** the game build a mockup was edited from */
  ref?: string;
}

export interface DraftConfig {
  slug: string;
  name: string;
  line: string;
  /** empty until P3 / P4 make one (a day-zero draft has none) */
  keyArt?: string;
  art: string;
  design: string;
  content: string;
  cams?: string;
  map?: { source: string; size: number };
  run: { stage: string; waiting: string; next: string };
  /** `requireRef`: every picture of the round must name the game build it was edited from (W1's provenance) */
  rounds: Record<string, { stage: string; kind: ItemKind; status: ItemStatus; requireRef?: boolean }>;
  files: FileRule[];
  stages: Record<string, { answers?: string[]; notes?: string[]; pick?: string }>;
  boards?: {
    id: string;
    stage: string;
    question: string;
    options: { label: string; item?: string; note?: string }[];
    recommended?: string;
    picked?: string;
    answer: string[];
  }[];
  protos?: { id: string; question: string; result: string; changed: string; items: string[]; play?: string; peakMB?: number }[];
  terrain?: {
    heights: string;
    labels: string;
    res: number;
    scene: string;
    spec: string;
    placeIds: Record<string, string>;
    variants: { id: string; title: string; stats: string }[];
  };
}

export interface DraftContent {
  places: Place[];
  steps: Omit<Step, 'items'>[];
  lanes: { stage: number; pts: [number, number][] }[];
  side: Side[];
  mechanics: Mechanic[];
  camChecks: Record<string, { ok: boolean | null; note: string }>;
  camChecksAll?: string;
  sets: SetPlan[];
}

const IMAGE = /\.(jpe?g|png|webp)$/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (IMAGE.test(name)) out.push(p);
  }
  return out;
}

/** `round-10-…` sorts after `round-9-…`. */
export function roundNumber(id: string): number {
  const m = /^round-(\d+)/.exec(id);
  return m?.[1] ? Number(m[1]) : 0;
}

export interface Readme {
  title: string;
  note: string;
  made: string;
  verdict: string;
}

export function parseReadme(text: string): Readme {
  const lines = text.split('\n');
  const title = (lines.find((l) => l.startsWith('# ')) ?? '').slice(2).trim();
  const firstPara = lines.find((l, i) => i > 0 && l.trim() !== '' && !l.startsWith('#') && !l.startsWith('-')) ?? '';
  const note = firstPara.replace(/^E\d+ \([\d-]+\)\.\s*/, '').trim();
  const field = (name: string): string => {
    const l = lines.find((x) => x.startsWith(`- **${name}:**`));
    return l ? l.slice(`- **${name}:**`.length).trim() : '';
  };
  return { title, note, made: field('Made with').replace(/\.$/, ''), verdict: field('Verdict') };
}

const PRETTY: Record<string, string> = {
  spawn: 'spawn', hub: 'hub', landmark: 'landmark', boss: 'boss', n: 'N', ne: 'NE', e: 'E', se: 'SE', s: 'S', sw: 'SW',
  w: 'W', nw: 'NW', w2: 'W (2)', se2: 'SE (2)', sled: 'sled',
};

function fill(template: string, groups: string[], ctx: { place?: Place | undefined; stepTitle?: string | undefined }): string {
  return template
    .replaceAll(/\{(\d)([UA]?)\}/g, (_, n: string, mod: string) => {
      const g = groups[Number(n)] ?? '';
      return mod === 'U' ? g.toUpperCase() : mod === 'A' ? (PRETTY[g] ?? g.toUpperCase()) : g;
    })
    .replace('{place}', ctx.place?.name ?? '')
    .replace('{stepTitle}', ctx.stepTitle ?? '');
}



function img(index: ImageIndex, source: string): Img | null {
  const e = index[source];
  return e ? { hash: e.hash, w: e.w, h: e.h } : null;
}

/** The Blob origin the index's uploads live on (every entry shares one store). */
export function blobOrigin(index: ImageIndex): string {
  const first = Object.values(index)[0];
  return first ? new URL(first.full.url).origin : '';
}

export interface BuildInput {
  root: string;
  config: DraftConfig;
  content: DraftContent;
  cams: Record<string, { eye: [number, number, number]; look: [number, number, number] }>;
  terrain: Terrain | null;
  /** the draft's design documents (read by atlas.ts from `design`) */
  design?: DesignDoc[];
  index: ImageIndex;
  now: string;
}

export interface BuildResult {
  atlas: Atlas;
  card: DraftCard;
  /** Every image source the atlas shows (for the publisher). */
  sources: string[];
  problems: string[];
}

export function buildAtlas({ root, config, content, cams, terrain, design = [], index, now }: BuildInput): BuildResult {
  const problems: string[] = [];
  const rel = (p: string): string => relative(root, p);
  if (!isStageId(config.run.stage)) problems.push(`run.stage ${config.run.stage} is not a stage`);
  const runStage: StageId = isStageId(config.run.stage) ? config.run.stage : 'P0';

  const placeByNum = new Map(content.places.map((p) => [p.num, p]));
  const stepTitle = new Map(content.steps.map((s) => [s.n, s.title]));
  const rules = config.files.map((r) => ({ ...r, re: new RegExp(r.match) }));

  const rounds: Round[] = [];
  const items: Item[] = [];
  const artDir = join(root, config.art);
  const roundIds = !existsSync(artDir) ? [] : readdirSync(artDir).filter((d) => statSync(join(artDir, d)).isDirectory()).sort((a, b) => roundNumber(a) - roundNumber(b));
  for (const rid of roundIds) {
    const def = config.rounds[rid];
    if (!def) { problems.push(`round ${rid} has no entry in draft.json rounds`); continue; }
    if (!isStageId(def.stage)) { problems.push(`round ${rid}: stage ${def.stage} is not a stage`); continue; }
    const readmePath = join(artDir, rid, 'README.md');
    const readme = existsSync(readmePath) ? parseReadme(readFileSync(readmePath, 'utf8')) : { title: rid, note: '', made: '', verdict: '' };
    if (!existsSync(readmePath)) problems.push(`round ${rid} has no README.md`);
    rounds.push({ id: rid, stage: def.stage, title: readme.title, note: readme.note, made: readme.made, verdict: readme.verdict });

    for (const file of walk(join(artDir, rid))) {
      const name = relative(join(artDir, rid), file);
      const item: Item = {
        id: `${rid}/${name}`, round: rid, stage: def.stage, kind: def.kind, title: name, status: def.status,
        images: img(index, rel(file)), spoiler: false,
      };
      let modelId: string | undefined;
      for (const r of rules) {
        const m = r.re.exec(name);
        if (!m) continue;
        const groups: string[] = [...m];
        const placeNum = r.placeNum ? Number(fill(r.placeNum, groups, {})) : undefined;
        const place = placeNum !== undefined ? placeByNum.get(placeNum) : undefined;
        const step = r.step ? Number(fill(r.step, groups, {})) : undefined;
        const ctx = { place, stepTitle: step !== undefined ? stepTitle.get(step) : undefined };
        if (r.kind) item.kind = r.kind;
        if (r.status) item.status = r.status;
        if (r.sub) item.sub = r.sub;
        if (r.model) modelId = r.model;
        if (place) item.place = place.id;
        if (step !== undefined) item.step = step;
        if (r.view) item.view = fill(r.view, groups, ctx);
        if (r.ref) item.ref = fill(r.ref, groups, ctx);
        if (r.angle) item.angle = PRETTY[fill(r.angle, groups, ctx)] ?? fill(r.angle, groups, ctx).toUpperCase();
        if (r.title) item.title = fill(r.title, groups, ctx);
      }
      if (modelId) item.view = `model-${modelId}`;
      const role = item.place ? content.places.find((p) => p.id === item.place)?.role : undefined;
      item.spoiler = spoilerByKind(item.kind, item.sub, role);
      items.push(item);
    }
  }

  // The key art and the map must be pictures of the draft.
  const keyItem = config.keyArt ? items.find((i) => `${config.art}/${i.id}` === config.keyArt) : undefined;
  if (config.keyArt && !keyItem) problems.push(`keyArt ${config.keyArt} is not an image under ${config.art}`);
  const mapItem = config.map ? items.find((i) => `${config.art}/${i.id}` === config.map?.source) : undefined;
  if (config.map && !mapItem) problems.push(`map ${config.map.source} is not an image under ${config.art}`);

  const stages: StageEntry[] = STAGES.map((s) => {
    const def = config.stages[s.id];
    const pick = def?.pick ? items.find((i) => i.id === def.pick)?.id : undefined;
    if (def?.pick && !pick) problems.push(`stage ${s.id}: pick ${def.pick} is not an item`);
    const order = stageOrder(s.id);
    const at = stageOrder(runStage);
    const entry: StageEntry = {
      id: s.id, name: s.name, state: order < at ? 'done' : order === at ? 'current' : 'todo',
      answers: def?.answers ?? [], notes: def?.notes ?? [], rounds: rounds.filter((r) => r.stage === s.id).map((r) => r.id),
    };
    if (pick) entry.pick = pick;
    return entry;
  });

  // A view's pictures in run order.
  const lineages: Record<string, string[]> = {};
  for (const it of items) {
    if (!it.view) continue;
    (lineages[it.view] ??= []).push(it.id);
  }
  const roundOf = new Map(rounds.map((r) => [r.id, roundNumber(r.id)]));
  for (const ids of Object.values(lineages)) {
    ids.sort((a, b) => {
      const ia = items.find((i) => i.id === a);
      const ib = items.find((i) => i.id === b);
      return (roundOf.get(ia?.round ?? '') ?? 0) - (roundOf.get(ib?.round ?? '') ?? 0);
    });
  }

  const camList: Cam[] = Object.entries(cams).map(([id, c]) => {
    const num = Number(id.slice(0, 2));
    const check = content.camChecks[id];
    return { id, place: placeByNum.get(num)?.id ?? id, eye: c.eye, look: c.look, ok: check?.ok ?? null, note: check?.note ?? '' };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const steps: Step[] = content.steps.map((s) => ({
    ...s,
    items: items.filter((i) => i.step === s.n && i.status === 'current').map((i) => i.id),
  }));

  const models: Model[] = [];
  for (const it of items) {
    if (it.kind !== 'concept' || !it.view?.startsWith('model-') || !it.sub) continue;
    models.push({
      id: it.view.slice('model-'.length), name: it.title, sub: it.sub, concept: it.id, model: null, inGame: null,
      spoiler: it.spoiler,
    });
  }

  const protos: Proto[] = (config.protos ?? []).map((p) => {
    for (const id of p.items) if (!items.some((i) => i.id === id)) problems.push(`proto ${p.id}: item ${id} is not an item`);
    return { id: p.id, question: p.question, result: p.result, changed: p.changed, items: p.items, play: p.play ?? null, peakMB: p.peakMB ?? null };
  });

  const sourceOf = (it: Item): string => `${config.art}/${it.id}`;
  for (const it of items) {
    if (config.rounds[it.round]?.requireRef === true && !it.ref) problems.push(`no ref (the build it was edited from): ${sourceOf(it)}`);
  }
  const boards: Board[] = (config.boards ?? []).map((b) => {
    if (!isStageId(b.stage)) problems.push(`board ${b.id}: stage ${b.stage} is not a stage`);
    for (const o of b.options) if (o.item && !items.some((i) => i.id === o.item)) problems.push(`board ${b.id}: option ${o.label}'s item ${o.item} is not an item`);
    const labels = new Set(b.options.map((o) => o.label));
    if (b.picked && !labels.has(b.picked)) problems.push(`board ${b.id}: picked ${b.picked} is not an option`);
    if (b.recommended && !labels.has(b.recommended)) problems.push(`board ${b.id}: recommended ${b.recommended} is not an option`);
    return {
      id: b.id, stage: isStageId(b.stage) ? b.stage : 'P0', question: b.question,
      options: b.options.map((o) => ({ label: o.label, item: o.item ?? null, note: o.note ?? '' })),
      recommended: b.recommended ?? null, picked: b.picked ?? null, answer: b.answer,
    };
  });
  for (const it of items) if (!it.images) problems.push(`no phone copy yet: ${sourceOf(it)} (run --publish)`);

  const keyArt = keyItem ? keyItem.images : null;
  const atlas: Atlas = {
    version: 1, blob: blobOrigin(index), art: config.art, slug: config.slug, name: config.name, line: config.line, generated: now,
    run: { stage: runStage, waiting: config.run.waiting, next: config.run.next }, keyArt,
    map: mapItem && config.map ? { item: mapItem.id, size: config.map.size } : null,
    stages, rounds, items, places: content.places, cams: camList, steps, side: content.side, lanes: content.lanes,
    mechanics: content.mechanics, models, sets: content.sets, protos, lineages, terrain, camNoteAll: content.camChecksAll ?? '', boards, design,
  };
  const card: DraftCard = {
    slug: config.slug, name: config.name, line: config.line, keyArt, stage: runStage, stageName: stageName(runStage),
    waiting: config.run.waiting, ticks: ticksDone(runStage),
  };
  return { atlas, card, sources: items.map(sourceOf), problems };
}

/** Public pages carry no spoiler (Done-when 3): the card is built only from name, line, stage and the key art. */
export function publicLeaks(card: DraftCard, atlas: Atlas): string[] {
  const leaks: string[] = [];
  const spoilers = new Set(atlas.items.filter((i) => i.spoiler).flatMap((i) => (i.images ? [i.images.hash] : [])));
  if (card.keyArt && spoilers.has(card.keyArt.hash)) leaks.push(`the card shows a spoiler image ${card.keyArt.hash}`);
  return leaks;
}
