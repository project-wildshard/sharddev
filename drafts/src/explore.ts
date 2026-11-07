// Draft Explore (WORLDCLAW-TOOLS W17, J44–J52): the mock-up mirror of the game's Explore. MODELS · SETS · WORLD · BEATS ·
// COVERAGE, filled with the draft's pictures. Read-only.
import { itemById, type Atlas, type Item, type Model, type SetPlan } from './atlas';
import { itemUrl } from './data';
import { h } from './dom';
import { LANE_COLORS, cone, mapView, pin, polyline } from './map';
import { draftHead, tile } from './pages';
import { openViewer } from './viewer';
import { coverageBody } from './coverage';

export const TABS = ['models', 'sets', 'world', 'beats', 'coverage'] as const;
export type Tab = (typeof TABS)[number];

function tabs(a: Atlas, on: Tab): HTMLElement {
  return h('div', { class: 'wd-tabs' }, TABS.map((t) => h('a', { class: `wd-tab${t === on ? ' wd-on' : ''}`, href: `#/${a.slug}/explore/${t}` }, t)));
}

function subtabs(a: Atlas, tab: Tab, on: string, list: [string, string][]): HTMLElement {
  return h('div', { class: 'wd-subtabs' }, list.map(([id, text]) => h('a', { class: `wd-subtab${id === on ? ' wd-on' : ''}`, href: `#/${a.slug}/explore/${tab}/${id}` }, text)));
}

function frame(a: Atlas, tab: Tab, ...body: (HTMLElement | null | HTMLElement[])[]): HTMLElement {
  return h('div', { class: 'wd-page' }, draftHead(a, 'explore'), tabs(a, tab), body);
}

function items(a: Atlas, ids: string[]): Item[] {
  return ids.map((id) => itemById(a, id)).filter((x): x is Item => Boolean(x));
}

// ---------------------------------------------------------------- MODELS (J45)

const SUB_LABEL: Record<Model['sub'], string> = { place: 'Place', character: 'Character', creature: 'Creature', boss: 'Boss', gear: 'Gear' };
const SUB_PLURAL: Record<Model['sub'], string> = { place: 'Places', character: 'Characters', creature: 'Creatures', boss: 'Bosses', gear: 'Gear' };

function modelStatus(m: Model): HTMLElement {
  return h('div', { class: 'wd-status' },
    h('span', { class: 'wd-chip wd-chip-ok' }, 'Concept ✓'),
    h('span', { class: `wd-chip ${m.model ? 'wd-chip-ok' : 'wd-chip-dim'}` }, `Model ${m.model ? '✓' : '—'}`),
    h('span', { class: `wd-chip ${m.inGame ? 'wd-chip-ok' : 'wd-chip-dim'}` }, `In game ${m.inGame ? '✓' : '—'}`));
}

function modelsTab(a: Atlas, id: string | undefined): HTMLElement {
  const m = id ? a.models.find((x) => x.id === id) : undefined;
  if (m) {
    const concept = itemById(a, m.concept);
    const lineage = items(a, a.lineages[`model-${m.id}`] ?? [m.concept]);
    return frame(a, 'models',
      h('div', { class: 'wd-section' }, h('a', { class: 'wd-back', href: `#/${a.slug}/explore/models` }, 'Models')),
      h('div', { class: 'wd-panel wd-section' },
        h('div', { class: 'wd-label' }, SUB_LABEL[m.sub]),
        h('div', { class: 'wd-h2', style: 'margin-top:4px' }, m.name),
        modelStatus(m),
        h('div', { class: 'wd-path' },
          h('div', null, h('div', { class: 'wd-path-cell' }, concept?.images ? h('img', { src: itemUrl(a, concept, 'thumb'), alt: '', onclick: () => openViewer(a, lineage, 0) }) : 'Concept'), h('div', { class: 'wd-label', style: 'margin-top:4px' }, 'Concept')),
          h('div', null, h('div', { class: 'wd-path-cell' }, m.model ? 'Model' : 'Not yet'), h('div', { class: 'wd-label', style: 'margin-top:4px' }, 'Model')),
          h('div', null, h('div', { class: 'wd-path-cell' }, m.inGame ? 'In game' : 'Not yet'), h('div', { class: 'wd-label', style: 'margin-top:4px' }, 'In game'))),
        h('p', { class: 'wd-p wd-dimtext' }, 'Models are made in the build (P11). Once the shard has a manifest, the game\'s Model Explorer shows them (J36).')),
      h('div', { class: 'wd-section' }, h('span', { class: 'wd-label' }, 'Part of'),
        a.sets.some((x) => x.members.some((mm) => mm.model === m.id))
          ? h('div', { class: 'wd-status' }, a.sets.filter((x) => x.members.some((mm) => mm.model === m.id)).map((x) => h('a', { class: 'wd-chip wd-chip-cyan', href: `#/${a.slug}/explore/sets/${x.id}` }, `${x.name} ×${x.members.filter((mm) => mm.model === m.id).reduce((n, mm) => n + mm.copies, 0)}`)))
          : h('p', { class: 'wd-p wd-dimtext' }, 'No planned set yet.')));
  }
  const groups: Model['sub'][] = ['character', 'creature', 'boss', 'gear'];
  return frame(a, 'models',
    a.models.length === 0 ? h('div', { class: 'wd-empty-state' }, 'No concepts yet (P4).') : null,
    groups.filter((g) => a.models.some((x) => x.sub === g)).map((g) => h('div', { class: 'wd-section' },
      h('span', { class: 'wd-label' }, SUB_PLURAL[g]),
      h('div', { class: 'wd-cards' }, a.models.filter((x) => x.sub === g).map((x) => {
        const c = itemById(a, x.concept);
        return h('a', { class: 'wd-mcard', href: `#/${a.slug}/explore/models/${x.id}` },
          c?.images ? h('img', { src: itemUrl(a, c, 'thumb'), alt: '', loading: 'lazy' }) : null,
          h('div', { class: 'wd-mcard-body' }, h('div', { class: 'wd-mcard-name' }, x.name), modelStatus(x)));
      })))));
}

// ---------------------------------------------------------------- SETS (J46, J49)

const fmt = (n: number): string => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

/** A set's planned totals: its models, copies, triangles of every copy, draws (one per member: copies are instanced). */
export function setTotals(set: SetPlan): { models: number; copies: number; tris: number; draws: number } {
  return {
    models: new Set(set.members.map((m) => m.model)).size,
    copies: set.members.reduce((n, m) => n + m.copies, 0),
    tris: set.members.reduce((n, m) => n + m.tris * m.copies, 0),
    draws: set.members.reduce((n, m) => n + m.draws, 0),
  };
}

function aerialBox(a: Atlas, set: SetPlan, big: boolean): HTMLElement {
  const aerial = set.aerial ? itemById(a, set.aerial) : undefined;
  return h('div', { class: `wd-set-aerial${big ? ' wd-big' : ''}` },
    aerial?.images ? h('img', { src: itemUrl(a, aerial, big ? 'full' : 'thumb'), alt: set.name, loading: 'lazy' }) : h('div', { class: 'wd-option-empty' }, 'No aerial yet'));
}

/** SETS (J46, J49): the Set Explorer's mirror with planned sets: a list by region → a set → its members. */
function setsTab(a: Atlas, id: string | undefined): HTMLElement {
  if (a.sets.length === 0) {
    return frame(a, 'sets', h('div', { class: 'wd-empty-state' },
      h('div', { class: 'wd-h3' }, 'No sets planned yet'),
      h('p', { class: 'wd-p' }, 'A set is the models placed in one spot, as the game\'s Set Explorer shows them. A draft plans its sets (members, copies, an aerial concept) once its catalog exists (P11); this tab then mirrors the Set Explorer with those plans.')));
  }
  const set = id ? a.sets.find((x) => x.id === id) : undefined;
  if (set) {
    const t = setTotals(set);
    return frame(a, 'sets',
      h('div', { class: 'wd-section' }, h('a', { class: 'wd-back', href: `#/${a.slug}/explore/sets` }, 'Sets')),
      h('div', { class: 'wd-label', style: 'margin-top:8px' }, `${set.region} · planned`),
      h('div', { class: 'wd-h2', style: 'margin-top:4px' }, set.name),
      aerialBox(a, set, true),
      set.bounds ? h('div', { class: 'wd-label', style: 'margin-top:6px' }, `Bounds ${set.bounds.w} × ${set.bounds.d} m at (${set.bounds.x}, ${set.bounds.z})`) : null,
      h('div', { class: 'wd-set-totals' },
        h('div', null, h('b', null, String(t.models)), h('span', { class: 'wd-label' }, 'Models')),
        h('div', null, h('b', null, String(t.copies)), h('span', { class: 'wd-label' }, 'Copies')),
        h('div', null, h('b', null, fmt(t.tris)), h('span', { class: 'wd-label' }, 'Tris')),
        h('div', null, h('b', null, String(t.draws)), h('span', { class: 'wd-label' }, 'Draws'))),
      h('div', { class: 'wd-section' }, h('span', { class: 'wd-label' }, 'Members'),
        set.members.map((m) => {
          const model = a.models.find((x) => x.id === m.model);
          const concept = model ? itemById(a, model.concept) : undefined;
          return h('a', { class: 'wd-set-member', href: `#/${a.slug}/explore/models/${m.model}` },
            concept?.images ? h('img', { src: itemUrl(a, concept, 'thumb'), alt: '', loading: 'lazy' }) : h('div', { class: 'wd-option-empty' }, '?'),
            h('div', null,
              h('div', { class: 'wd-mcard-name' }, model?.name ?? m.model),
              h('div', { class: 'wd-label' }, `×${m.copies} · ${fmt(m.tris)} tris each · ${m.draws} draw${m.draws === 1 ? '' : 's'}`),
              model ? modelStatus(model) : h('span', { class: 'wd-chip wd-chip-bad' }, 'No concept')));
        })));
  }
  const regions = [...new Set(a.sets.map((x) => x.region))];
  return frame(a, 'sets', regions.map((r) => h('div', { class: 'wd-section' },
    h('span', { class: 'wd-label' }, r),
    a.sets.filter((x) => x.region === r).map((x) => {
      const t = setTotals(x);
      return h('a', { class: 'wd-set-card', href: `#/${a.slug}/explore/sets/${x.id}` },
        aerialBox(a, x, false),
        h('div', null,
          h('div', { class: 'wd-h3' }, x.name),
          h('div', { class: 'wd-label', style: 'margin-top:4px' }, `${t.models} models · ${t.copies} copies · ${fmt(t.tris)} tris · ${t.draws} draws`),
          h('div', { class: 'wd-status' }, x.members.map((mem) => h('span', { class: 'wd-chip wd-chip-cyan' }, `${a.models.find((mm) => mm.id === mem.model)?.name ?? mem.model} ×${mem.copies}`)))));
    }))));
}

// ---------------------------------------------------------------- WORLD (J46, J50)

const ANGLES: Record<string, [number, number]> = { N: [0, -1], NE: [0.7, -0.7], E: [1, 0], SE: [0.7, 0.7], S: [0, 1], SW: [-0.7, 0.7], W: [-1, 0], NW: [-0.7, -0.7] };

function worldTab(a: Atlas, sub: string, arg: string | undefined): HTMLElement {
  const st = subtabs(a, 'world', sub, [['views', 'Viewpoints'], ['fp', 'First-person'], ['all', 'Carousel'], ['maplab', 'Map Lab']]);
  if (sub === 'fp') return frame(a, 'world', st, firstPerson(a, arg));
  if (sub === 'all') {
    const list = a.items.filter((i) => (i.kind === 'map' || i.kind === 'world') && (i.status === 'picked' || i.status === 'current'));
    const blockouts = a.items.filter((i) => i.kind === 'blockout' && i.view?.startsWith('world-'));
    const all = [...list, ...blockouts];
    return frame(a, 'world', st, h('div', { class: 'wd-section' },
      h('span', { class: 'wd-label' }, 'The approved map and its World Explorer views'),
      h('div', { class: 'wd-grid' }, all.map((it) => tile(a, it, all, it.angle ? `${it.kind === 'blockout' ? 'Blockout' : 'View'} · ${it.angle}` : it.title)))));
  }
  if (sub === 'maplab') {
    return frame(a, 'world', st, h('div', { class: 'wd-section' },
      h('p', { class: 'wd-p' }, 'Map Lab: the map\'s layers and live numbers, the terrain walk and the variant checks (J31). Nothing saves (J24).'),
      h('a', { class: 'wd-btn', href: `#/${a.slug}/maplab`, style: 'margin-top:10px' }, 'Open Map Lab')));
  }
  // Viewpoints: the map with a marker per World Explorer angle and per first-person camera; a tap opens its pictures.
  const m = mapView(a, { dim: 0.15 });
  if (!m) return frame(a, 'world', st, h('div', { class: 'wd-empty-state' }, 'No approved map yet (P5).'));
  const worldViews = a.items.filter((i) => i.kind === 'world' && i.view?.startsWith('world-'));
  for (const [ang, [dx, dz]] of Object.entries(ANGLES)) {
    const views = worldViews.filter((i) => i.angle === ang);
    const lineage = views[0]?.view ? items(a, a.lineages[views[0].view] ?? []) : views;
    if (lineage.length === 0) continue;
    pin(m, dx * 215, dz * 215, ang, '#8fe3ff', () => openViewer(a, lineage, lineage.length - 1), 26);
  }
  for (const cam of a.cams) {
    const p = a.places.find((x) => x.id === cam.place);
    pin(m, cam.eye[0], cam.eye[2], String(p?.num ?? ''), cam.ok === false ? '#ff6b6b' : '#f2a640', () => { location.hash = `#/${a.slug}/explore/world/fp/${cam.id}`; }, 16);
  }
  return frame(a, 'world', st, m.el,
    h('div', { class: 'wd-map-legend' },
      h('span', null, h('span', { class: 'wd-swatch', style: 'background:#8fe3ff' }), 'World view'),
      h('span', null, h('span', { class: 'wd-swatch', style: 'background:#f2a640' }), 'First-person camera'),
      h('span', null, h('span', { class: 'wd-swatch', style: 'background:#ff6b6b' }), 'View to redo')));
}

/** FIRST-PERSON (J50): each view over its camera on the map, beside the blockout from the same camera, with its check. */
function firstPerson(a: Atlas, camId: string | undefined): HTMLElement {
  if (a.cams.length === 0) return h('div', { class: 'wd-empty-state' }, 'No first-person cameras yet (P6).');
  const i = Math.max(0, a.cams.findIndex((c) => c.id === camId));
  const cam = a.cams[i];
  if (!cam) return h('div');
  const place = a.places.find((p) => p.id === cam.place);
  const views = a.items.filter((it) => it.kind === 'fp' && it.place === cam.place && it.status === 'current');
  const blockout = a.items.find((it) => it.kind === 'blockout' && it.place === cam.place);
  const pair = [...views, ...(blockout ? [blockout] : [])];
  const m = mapView(a, { dim: 0.2, thumb: true });
  if (m) {
    const dist = Math.hypot(cam.look[0] - cam.eye[0], cam.look[2] - cam.eye[2]);
    cone(m, cam, cam.ok === false ? '#ff6b6b' : '#f2a640', Math.max(60, dist * 1.4));
    if (place) pin(m, place.x, place.z, String(place.num), '#8fe3ff', undefined, 14);
  }
  const prev = a.cams[i - 1];
  const next = a.cams[i + 1];
  return h('div', null,
    h('div', { class: 'wd-section wd-round-head' },
      h('div', { class: 'wd-h2' }, `${place?.num ?? ''} · ${place?.name ?? cam.place}`),
      cam.ok === null ? h('span', { class: 'wd-chip wd-chip-dim' }, 'Not reviewed') : cam.ok ? h('span', { class: 'wd-chip wd-chip-ok' }, 'Kept') : h('span', { class: 'wd-chip wd-chip-bad' }, 'Redo')),
    cam.note ? h('p', { class: 'wd-p' }, cam.note) : null,
    a.camNoteAll ? h('p', { class: 'wd-p wd-dimtext' }, h('span', { class: 'wd-label' }, 'Every view '), a.camNoteAll) : null,
    h('div', { class: 'wd-pair' }, pair.map((it, k) => h('figure', null,
      h('img', { src: itemUrl(a, it, 'thumb'), alt: it.title, loading: 'lazy', onclick: () => openViewer(a, pair, k) }),
      h('figcaption', { class: 'wd-label' }, it.kind === 'blockout' ? 'Blockout · same camera' : 'First-person view')))),
    m ? h('div', { class: 'wd-section' }, h('span', { class: 'wd-label' }, 'The camera on the approved map'), m.el) : null,
    h('div', { class: 'wd-pager' },
      prev ? h('a', { href: `#/${a.slug}/explore/world/fp/${prev.id}` }, '‹') : h('span', { class: 'wd-pager-off' }, '‹'),
      h('span', { class: 'wd-label' }, `${i + 1} / ${a.cams.length}`),
      next ? h('a', { href: `#/${a.slug}/explore/world/fp/${next.id}` }, '›') : h('span', { class: 'wd-pager-off' }, '›')));
}

// ---------------------------------------------------------------- BEATS (J47)

function journeyMap(a: Atlas, highlight?: number): HTMLElement | null {
  const m = mapView(a, { dim: 0.15, thumb: highlight !== undefined });
  if (!m) return null;
  for (const lane of a.lanes) polyline(m, lane.pts, LANE_COLORS[lane.stage] ?? '#8fe3ff', 7, '14 10');
  const pts = a.steps.map((st) => [st.x, st.z] as [number, number]);
  polyline(m, pts, 'rgba(143,227,255,0.65)', 3);
  for (const st of a.steps) {
    const on = highlight === undefined || highlight === st.n;
    pin(m, st.x, st.z, String(st.n), on ? (highlight === st.n ? '#f2a640' : '#8fe3ff') : 'rgba(143,227,255,0.35)', highlight === undefined ? () => { location.hash = `#/${a.slug}/explore/beats/step/${st.n}`; } : undefined, highlight === st.n ? 24 : 18);
  }
  return m.el;
}

function mechChip(a: Atlas, id: string): HTMLElement {
  const mech = a.mechanics.find((x) => x.id === id);
  if (!mech) return h('span', { class: 'wd-chip wd-chip-dim' }, id);
  const done = mech.state === 'done';
  return h('div', { class: 'wd-mech' },
    h('div', null, h('div', { class: 'wd-mech-name' }, mech.name), h('div', { class: 'wd-label' }, `${mech.isNew ? 'New' : 'Engine'} · ${mech.row}`)),
    h('span', { class: `wd-chip ${done ? 'wd-chip-ok' : ''}` }, done ? 'Done' : 'To build'));
}

function beatsTab(a: Atlas, sub: string, arg: string | undefined): HTMLElement {
  const st = subtabs(a, 'beats', sub === 'step' ? 'journey' : sub, [['journey', 'The journey'], ['mechanics', 'Mechanics']]);
  if (a.steps.length === 0) return frame(a, 'beats', st, h('div', { class: 'wd-empty-state' }, 'No content boards yet (P5b).'));
  if (sub === 'mechanics') {
    const done = a.mechanics.filter((x) => x.state === 'done').length;
    return frame(a, 'beats', st,
      h('div', { class: 'wd-panel wd-section' }, h('div', { class: 'wd-h3' }, `${a.mechanics.length} mechanics · ${done} done · ${a.mechanics.length - done} to build`)),
      a.mechanics.map((x) => {
        const steps = a.steps.filter((s2) => s2.mechanics.includes(x.id)).map((s2) => s2.n);
        return h('div', { class: 'wd-mech' },
          h('div', null, h('div', { class: 'wd-mech-name' }, x.name),
            h('div', { class: 'wd-label' }, `${x.isNew ? 'New' : 'Engine'} · ${x.row} · ${steps.length > 0 ? `steps ${steps.join(', ')}` : x.where}`),
            h('div', { class: 'wd-p wd-dimtext', style: 'font-size:11px' }, x.engine)),
          h('span', { class: `wd-chip ${x.state === 'done' ? 'wd-chip-ok' : ''}` }, x.state === 'done' ? 'Done' : 'To build'));
      }));
  }
  if (sub === 'step') {
    const n = Number(arg ?? '1');
    const step = a.steps.find((x) => x.n === n) ?? a.steps[0];
    if (!step) return frame(a, 'beats', st);
    const pics = items(a, step.items);
    const prev = a.steps.find((x) => x.n === step.n - 1);
    const next = a.steps.find((x) => x.n === step.n + 1);
    const mini = journeyMap(a, step.n);
    return frame(a, 'beats', st,
      h('div', { class: 'wd-panel wd-section' },
        h('div', { class: 'wd-h2' }, h('span', { class: 'wd-amber' }, `Step ${step.n}`), ` · ${step.title}`),
        h('p', { class: 'wd-p' }, step.why),
        step.gets ? h('p', { class: 'wd-p' }, h('span', { class: 'wd-label' }, 'Gets '), step.gets) : null,
        h('div', { class: 'wd-board' }, mini ? h('div', null, mini) : h('div'), pics.map((it, k) => h('div', null, h('img', { src: itemUrl(a, it, 'thumb'), alt: it.title, loading: 'lazy', onclick: () => openViewer(a, pics, k) }))))),
      h('div', { class: 'wd-section' }, h('span', { class: 'wd-label' }, 'Mechanics'), step.mechanics.length > 0 ? step.mechanics.map((id) => mechChip(a, id)) : h('p', { class: 'wd-p wd-dimtext' }, 'Existing verbs only.')),
      h('div', { class: 'wd-pager' },
        prev ? h('a', { href: `#/${a.slug}/explore/beats/step/${prev.n}` }, '‹') : h('span', { class: 'wd-pager-off' }, '‹'),
        h('span', { class: 'wd-label' }, `Step ${step.n} / ${a.steps.length}`),
        next ? h('a', { href: `#/${a.slug}/explore/beats/step/${next.n}` }, '›') : h('span', { class: 'wd-pager-off' }, '›')));
  }
  const journeyBoards = a.items.filter((i) => i.kind === 'journey' && i.status === 'current');
  return frame(a, 'beats', st,
    journeyMap(a),
    h('div', { class: 'wd-map-legend' }, [1, 2, 3, 4].map((k) => h('span', null, h('span', { class: 'wd-swatch', style: `background:${LANE_COLORS[k] ?? '#8fe3ff'}` }), `Lane ${k}`))),
    h('div', { class: 'wd-section' }, h('span', { class: 'wd-label' }, 'The steps'),
      a.steps.map((x) => h('a', { class: 'wd-stage-row', href: `#/${a.slug}/explore/beats/step/${x.n}`, style: 'grid-template-columns:36px 1fr auto' },
        h('div', { class: 'wd-stage-id', style: `color:${LANE_COLORS[x.lane] ?? '#8fe3ff'}` }, String(x.n)),
        h('div', null, h('div', { class: 'wd-stage-name' }, x.title), h('div', { class: 'wd-stage-ans' }, x.why)),
        h('span', { class: 'wd-label' }, x.mechanics.some((id) => a.mechanics.find((mm) => mm.id === id)?.isNew) ? `${x.mechanics.length} mech` : '')))),
    journeyBoards.length > 0 ? h('div', { class: 'wd-section' }, h('span', { class: 'wd-label' }, 'The content boards'), h('div', { class: 'wd-grid' }, journeyBoards.map((it) => tile(a, it, journeyBoards)))) : null,
    a.side.length > 0 ? h('div', { class: 'wd-section' }, h('span', { class: 'wd-label' }, 'Side content, feats, secrets, happenings'),
      a.side.map((x) => h('div', { class: 'wd-place-row' }, h('div', { class: 'wd-place-row-head' }, h('span', { class: 'wd-h3' }, x.title), h('span', { class: 'wd-label' }, x.id)), h('p', { class: 'wd-p wd-dimtext' }, x.text)))) : null);
}

// ---------------------------------------------------------------- COVERAGE (J48, J52), measured (coverage.ts)

function coverageTab(a: Atlas, sub: string): HTMLElement {
  const st = subtabs(a, 'coverage', sub, [['map', 'Map'], ['places', 'Places'], ['cameras', 'Cameras']]);
  return frame(a, 'coverage', st, coverageBody(a, sub));
}

export function explorePage(a: Atlas, tab: string | undefined, sub: string | undefined, arg: string | undefined): HTMLElement {
  const t: Tab = (TABS as readonly string[]).includes(tab ?? '') ? (tab as Tab) : 'models';
  if (t === 'models') return modelsTab(a, sub);
  if (t === 'sets') return setsTab(a, sub);
  if (t === 'world') return worldTab(a, sub ?? 'views', arg);
  if (t === 'beats') return beatsTab(a, sub ?? 'journey', arg);
  return coverageTab(a, sub ?? 'map');
}
