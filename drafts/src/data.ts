// Loading the drafts' data: `/data/index.json` for the title, `/data/<slug>/atlas.json` for a draft. Both are generated
// by drafts/tools/atlas.ts and ship with each drafts deploy; the pictures come from Blob (J28).
import { imgUrl, type Atlas, type DraftIndex, type Img, type Item } from './atlas';

let indexP: Promise<DraftIndex> | null = null;
const atlases = new Map<string, Promise<Atlas>>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function draftIndex(): Promise<DraftIndex> {
  indexP ??= getJson<DraftIndex>('/data/index.json').catch((e: unknown) => { indexP = null; throw e; });
  return indexP;
}

export function atlas(slug: string): Promise<Atlas> {
  let p = atlases.get(slug);
  if (!p) {
    p = getJson<Atlas>(`/data/${encodeURIComponent(slug)}/atlas.json`).catch((e: unknown) => { atlases.delete(slug); throw e; });
    atlases.set(slug, p);
  }
  return p;
}

export function url(a: { blob: string; slug: string }, img: Img, size: 'full' | 'thumb'): string {
  return imgUrl(a.blob, a.slug, img, size);
}

export function itemUrl(a: Atlas, it: Item, size: 'full' | 'thumb'): string {
  return it.images ? url(a, it.images, size) : '';
}
