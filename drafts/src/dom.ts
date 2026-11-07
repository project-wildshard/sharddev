// A tiny DOM builder for the drafts site: no framework (J15: the shell stays ≤ 60 KB gzip).

type Child = Node | string | number | false | null | undefined | Child[];
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
      else if (k === 'class') el.className = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: ParentNode, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

const SVG = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, string | number | EventListener | undefined> | null, ...children: (SVGElement | string | null | false | undefined)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined) continue;
      if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el: Element): void {
  el.replaceChildren();
}

/** Per-device convenience storage; never required (private mode and blocked storage throw). */
export function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked: the switch lasts for this page only
  }
}
