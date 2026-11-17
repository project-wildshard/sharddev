// texmem-probe.mjs — the in-page halves of scripts/gpu-texmem.mjs (E157): `ledger`
// (an init script: the WebGL texture allocation ledger, window.__texmem) and `report` (after the settle: totals by format /
// source, the scene's textures labelled). Both are serialised into the page by Playwright: self-contained, no imports.
/** in the page before any script: the WebGL allocation ledger (window.__texmem) */
export function ledger() {
  const BPP = {
    0x8058: 4, 0x8c43: 4, 0x8051: 4, 0x8c41: 4, 0x1908: 4, 0x1907: 4, // RGBA8 SRGB8_ALPHA8 RGB8 SRGB8 RGBA RGB
    0x8229: 1, 0x822b: 2, 0x1909: 1, 0x190a: 2, 0x1906: 1, 0x8231: 1, 0x8233: 1, // R8 RG8 LUMINANCE LUMINANCE_ALPHA ALPHA R8I R8UI
    0x822d: 2, 0x822f: 4, 0x881a: 8, 0x881b: 8, 0x8814: 16, 0x8815: 16, 0x822e: 4, 0x8230: 8, // R16F RG16F RGBA16F RGB16F RGBA32F RGB32F R32F RG32F
    0x8c3a: 4, 0x8c3d: 4, 0x8059: 4, 0x906f: 4, // R11F_G11F_B10F RGB9_E5 RGB10_A2 RGB10_A2UI
    0x81a5: 2, 0x81a6: 4, 0x8cac: 4, 0x88f0: 4, 0x8cad: 8, 0x1902: 4, 0x84f9: 4, // DEPTH16 DEPTH24 DEPTH32F DEPTH24_STENCIL8 DEPTH32F_STENCIL8 DEPTH_COMPONENT DEPTH_STENCIL
    0x8d62: 2, 0x8056: 2, 0x8057: 2, 0x8d48: 1, // RGB565 RGBA4 RGB5_A1 STENCIL8
    0x8235: 4, 0x8236: 4, 0x823b: 8, 0x823c: 8, 0x8d70: 16, 0x8d71: 12, 0x8d82: 4, 0x8d83: 4, // R32I R32UI RG32I RG32UI RGBA32UI RGB32UI …
  };
  const TYPEB = { 0x1401: 1, 0x1406: 4, 0x140b: 2, 0x8d61: 2, 0x1403: 2, 0x1405: 4 }; // UNSIGNED_BYTE FLOAT HALF_FLOAT HALF_FLOAT_OES UNSIGNED_SHORT UNSIGNED_INT
  const texs = new Map(); // WebGLTexture → { levels: Map<key, bytes>, w, h, d, fmt, rt, compressed, storage }
  const rbs = new Map();
  const T = { id: 0 };
  const P = { texs, rbs, bound: new Map(), unit: 0x84c0, urls: new Set() };
  window.__texmem = P;
  try { performance.setResourceTimingBufferSize(10000); } catch { /* the default 250 drops a big shard's late files */ }
  // where each decoded image came from: Response.blob() tags its blob with the response URL, createImageBitmap passes the
  // tag on (GLB-embedded images arrive as blob: URLs — 'glb'); an <img>'s src is its own tag
  const tags = new WeakMap(); P.tags = tags;
  const ob = Object.getOwnPropertyDescriptor(Response.prototype, 'blob')?.value;
  const resUrl = new WeakMap(); // the game re-wraps responses (the byte counter's tee): remember the URL each fetch asked for
  const tagFetch = (f) => async function taggedFetch(input, init) {
    try { const u0 = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url; if (!u0.startsWith('blob:')) P.urls.add(new URL(u0, location.href).pathname); } catch { /* */ }
    const res = await f.call(window, input, init);
    try { const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url; resUrl.set(res, u.startsWith('blob:') ? 'glb-embedded' : new URL(u, location.href).pathname); } catch { /* */ }
    return res;
  };
  let fetchFn = tagFetch(window.fetch);
  Object.defineProperty(window, 'fetch', { configurable: true, get: () => fetchFn, set: (f) => { fetchFn = tagFetch(f); } });
  Response.prototype.blob = async function blob() { const b = await Reflect.apply(ob, this, []); try { const u = resUrl.get(this) ?? this.url; tags.set(b, u.startsWith('blob:') ? 'glb-embedded' : u.startsWith('/') || u === 'glb-embedded' ? u : new URL(u).pathname); } catch { /* */ } return b; };
  const ocib = window.createImageBitmap.bind(window);
  window.createImageBitmap = async function createImageBitmap(src, ...rest) { const bm = await ocib(src, ...rest); const t = tags.get(src) ?? (src instanceof Blob ? 'blob' : src.src ?? src.constructor.name); if (t) tags.set(bm, t); return bm; };
  const tagOf = (src) => { if (!src || typeof src !== 'object') return ''; const t = tags.get(src); if (t) return t; if (src.src) { try { return new URL(src.src).pathname; } catch { return String(src.src).slice(0, 40); } } return src.constructor.name; };
  const cur = (target) => {
    const t2 = target >= 0x8515 && target <= 0x851a ? 0x8513 : target; // cube faces → cube map
    return P.bound.get(`${P.unit}:${t2}`) ?? null;
  };
  const rec = (tex) => { let r = texs.get(tex); if (r === undefined) { r = { id: ++T.id, levels: new Map(), w: 0, h: 0, d: 1, fmt: 0, rt: false, compressed: false, cube: false, mipGen: false, tag: '' }; texs.set(tex, r); } return r; };
  const dimsOf = (src) => {
    const w = src.naturalWidth ?? src.videoWidth ?? src.displayWidth ?? src.width ?? 0;
    const h = src.naturalHeight ?? src.videoHeight ?? src.displayHeight ?? src.height ?? 0;
    return [w, h];
  };
  for (const Ctx of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    const p = Ctx.prototype;
    const wrap = (name, fn) => {
      const o = p[name];
      if (typeof o !== 'function') return;
      p[name] = function wrapped(...a) { try { fn(a); } catch { /* ledger only */ } return Reflect.apply(o, this, a); };
    };
    wrap('activeTexture', (a) => { P.unit = a[0]; });
    wrap('bindTexture', (a) => { P.bound.set(`${P.unit}:${a[0]}`, a[1]); if (a[1]) { const r = rec(a[1]); if (a[0] === 0x8513) r.cube = true; if (a[0] === 0x8c1a || a[0] === 0x806f) r.array = a[0]; } });
    wrap('deleteTexture', (a) => { texs.delete(a[0]); });
    wrap('texStorage2D', (a) => {
      const [target, levels, fmt, w, h] = a; const t = cur(target); if (!t) return; const r = rec(t);
      r.w = w; r.h = h; r.fmt = fmt; r.storage = true; r.levels.clear();
      const faces = target === 0x8513 ? 6 : 1;
      const cfmt = !(fmt in BPP);
      for (let l = 0; l < levels; l++) {
        const lw = Math.max(1, w >> l), lh = Math.max(1, h >> l);
        r.levels.set(`${l}`, cfmt ? Math.ceil(lw / 4) * Math.ceil(lh / 4) * (P.blockBytes?.[fmt] ?? 16) * faces : lw * lh * BPP[fmt] * faces);
      }
      if (cfmt) r.compressed = true;
    });
    wrap('texStorage3D', (a) => {
      const [target, levels, fmt, w, h, d] = a; const t = cur(target); if (!t) return; const r = rec(t);
      r.w = w; r.h = h; r.d = d; r.fmt = fmt; r.storage = true; r.levels.clear();
      const cfmt = !(fmt in BPP);
      for (let l = 0; l < levels; l++) {
        const lw = Math.max(1, w >> l), lh = Math.max(1, h >> l), ld = target === 0x806f ? Math.max(1, d >> l) : d;
        r.levels.set(`${l}`, cfmt ? Math.ceil(lw / 4) * Math.ceil(lh / 4) * (P.blockBytes?.[fmt] ?? 16) * ld : lw * lh * ld * BPP[fmt]);
      }
      if (cfmt) r.compressed = true;
    });
    wrap('texImage2D', (a) => {
      const target = a[0], level = a[1], fmt = a[2]; const t = cur(target); if (!t) return; const r = rec(t);
      let w, h, type;
      if (a.length >= 8) { w = a[3]; h = a[4]; type = a[7]; } else { [w, h] = dimsOf(a[5]); type = a[4]; r.tag = tagOf(a[5]); }
      let bpp = BPP[fmt] ?? 4;
      if (fmt === 0x1908 || fmt === 0x1907) bpp = 4 * (TYPEB[type] ?? 1);
      if (level === 0) { r.w = w; r.h = h; r.fmt = fmt; }
      r.levels.set(`${target}:${level}`, w * h * bpp);
    });
    wrap('texImage3D', (a) => {
      const [target, level, fmt, w, h, d] = a; const type = a[8]; const t = cur(target); if (!t) return; const r = rec(t);
      let bpp = BPP[fmt] ?? 4; if (fmt === 0x1908 || fmt === 0x1907) bpp = 4 * (TYPEB[type] ?? 1);
      if (level === 0) { r.w = w; r.h = h; r.d = d; r.fmt = fmt; }
      r.levels.set(`${target}:${level}`, w * h * d * bpp);
    });
    wrap('compressedTexImage2D', (a) => {
      const [target, level, fmt, w, h] = a; const t = cur(target); if (!t) return; const r = rec(t);
      const data = a[6]; const n = typeof data === 'number' ? data : (a.length > 8 && typeof a[8] === 'number' ? a[8] : data?.byteLength ?? 0);
      if (level === 0) { r.w = w; r.h = h; r.fmt = fmt; }
      r.compressed = true; r.levels.set(`${target}:${level}`, n);
    });
    wrap('compressedTexImage3D', (a) => {
      const [target, level, fmt, w, h, d] = a; const t = cur(target); if (!t) return; const r = rec(t);
      const data = a[7]; const n = typeof data === 'number' ? data : data?.byteLength ?? 0;
      if (level === 0) { r.w = w; r.h = h; r.d = d; r.fmt = fmt; }
      r.compressed = true; r.levels.set(`${target}:${level}`, n);
    });
    wrap('texSubImage2D', (a) => { const t = cur(a[0]); if (!t) return; const src = a[a.length - 1]; const g = tagOf(src); if (g && !/Uint|Float|Int|DataView|Array/.test(g)) { const r = rec(t); if (r.tag === '') r.tag = g; } });
    wrap('texSubImage3D', (a) => { const t = cur(a[0]); if (!t) return; const src = a[a.length - 1]; const g = tagOf(src); if (g && !/Uint|Float|Int|DataView|Array/.test(g)) { const r = rec(t); if (r.tag === '') r.tag = g; else if (!r.tag.includes(g) && !r.tag.endsWith('+')) r.tag = `${r.tag}+`; } });
    wrap('generateMipmap', (a) => {
      const t = cur(a[0]); if (!t) return; const r = rec(t);
      if (r.storage) return; // the chain was allocated by texStorage
      r.mipGen = true;
      const base = [...r.levels.values()].reduce((s, v) => s + v, 0);
      r.levels.set('mips', Math.round(base / 3));
    });
    wrap('framebufferTexture2D', (a) => { if (a[3]) rec(a[3]).rt = true; });
    wrap('framebufferTextureLayer', (a) => { if (a[2]) rec(a[2]).rt = true; });
    wrap('bindRenderbuffer', (a) => { P.rb = a[1]; });
    wrap('deleteRenderbuffer', (a) => { rbs.delete(a[0]); });
    wrap('renderbufferStorage', (a) => { if (P.rb) rbs.set(P.rb, a[2] * a[3] * (BPP[a[1]] ?? 4)); });
    wrap('renderbufferStorageMultisample', (a) => { if (P.rb) rbs.set(P.rb, a[3] * a[4] * (BPP[a[2]] ?? 4) * a[1]); });
  }
  // compressed block sizes (bytes per 4×4 block): ASTC 4x4 16, BC7 16, BC1 8, BC3 16, ETC2 RGB 8, ETC2 RGBA 16, ETC1 8
  P.blockBytes = { 0x93b0: 16, 0x93d0: 16, 0x8e8c: 16, 0x8e8d: 16, 0x83f0: 8, 0x83f1: 8, 0x83f3: 16, 0x8c4c: 8, 0x8c4f: 16, 0x9274: 8, 0x9275: 8, 0x9278: 16, 0x9279: 16, 0x8d64: 8 };
}

/** in the page, after the settle: totals + the scene's textures, labelled */
export function report(top) {
  const P = window.__texmem, g = window.__wildshard?.world?.game;
  const sum = (r) => [...r.levels.values()].reduce((s, v) => s + v, 0);
  const mb = (b) => Number((b / 1048576).toFixed(1));
  const FMT = { 0x8058: 'RGBA8', 0x8c43: 'SRGB8_A8', 0x8051: 'RGB8', 0x1908: 'RGBA', 0x1907: 'RGB', 0x93b0: 'ASTC4x4', 0x93d0: 'SRGB_ASTC4x4', 0x8e8c: 'BC7', 0x8e8d: 'SRGB_BC7', 0x83f0: 'BC1', 0x83f3: 'BC3', 0x9274: 'ETC2', 0x9275: 'SRGB_ETC2', 0x9278: 'ETC2_EAC', 0x9279: 'SRGB_ETC2_EAC', 0x8d64: 'ETC1', 0x881a: 'RGBA16F', 0x822d: 'R16F', 0x8229: 'R8', 0x822b: 'RG8', 0x88f0: 'D24S8', 0x81a6: 'D24', 0x8cac: 'D32F', 0x8c3a: 'R11G11B10F', 0x8814: 'RGBA32F', 0x822e: 'R32F', 0x1909: 'LUM' };
  const owner = new Map(); // WebGLTexture → labels
  if (g) {
    const props = g.renderer.properties;
    const seen = new Set();
    const label = (tex, where) => {
      if (!tex?.isTexture) return;
      const gl = props.get(tex).__webglTexture; if (!gl) return;
      let o = owner.get(gl); if (o === undefined) { o = { names: new Set(), where: new Set(), src: '' }; owner.set(gl, o); }
      o.where.add(where);
      const im = tex.image;
      if (o.src === '') o.src = tex.isCompressedTexture ? 'compressed' : im?.src ? String(im.src).slice(-60) : im?.constructor?.name ?? '';
      if (tex.name) o.names.add(tex.name);
    };
    const path = (obj) => { const n = []; for (let o = obj; o && n.length < 3; o = o.parent) if (o.name) n.push(o.name); return n.join('<') || obj.type; };
    g.scene.traverse((obj) => {
      const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
      for (const m of mats) {
        if (!m || seen.has(m.uuid + obj.uuid)) continue; seen.add(m.uuid + obj.uuid);
        for (const k of Object.keys(m)) { const v = m[k]; if (v?.isTexture) label(v, `${path(obj)}.${k}`); }
        if (m.uniforms) for (const [k, u] of Object.entries(m.uniforms)) { const v = u?.value; if (v?.isTexture) label(v, `${path(obj)}.u:${k}`); if (Array.isArray(v)) for (const x of v) if (x?.isTexture) label(x, `${path(obj)}.u:${k}[]`); }
      }
    });
    if (g.scene.background?.isTexture) label(g.scene.background, 'scene.background');
    if (g.scene.environment?.isTexture) label(g.scene.environment, 'scene.environment');
  }
  let texBytes = 0, rtBytes = 0, compressedBytes = 0, n = 0, nComp = 0;
  const rows = [];
  for (const [gl, r] of P.texs) {
    const b = sum(r); if (b === 0) continue;
    if (r.rt) { rtBytes += b; continue; }
    texBytes += b; n++;
    if (r.compressed) { compressedBytes += b; nComp++; }
    const o = owner.get(gl);
    rows.push({ id: r.id, mb: Number((b / 1048576).toFixed(2)), w: r.w, h: r.h, d: r.d, fmt: FMT[r.fmt] ?? `0x${r.fmt.toString(16)}`, mips: r.storage ? 'storage' : r.mipGen ? 'gen' : [...r.levels.keys()].length > 1 ? 'up' : 'none', src: r.tag === '' ? o?.src ?? '' : r.tag, name: o ? [...o.names].join(',') : '', where: o ? [...o.where].slice(0, 3).join(' | ') : '(not in scene)' });
  }
  rows.sort((a, b) => b.mb - a.mb);
  let rbBytes = 0; for (const v of P.rbs.values()) rbBytes += v;
  const byFmt = {};
  for (const r of rows) byFmt[r.fmt] = Number(((byFmt[r.fmt] ?? 0) + r.mb).toFixed(2));
  const cls = (r) => { const s = r.src; if (s.startsWith('/assets/')) { const p = s.split('/'); return p.slice(0, p[2] === 'baked' || p[2] === 'models' ? 5 : 4).join('/'); } return s.startsWith('glb') ? 'glb-embedded' : `runtime ${s === '' ? '?' : s}`; };
  const byClass = {};
  for (const r of rows) { const k = cls(r); byClass[k] ??= { mb: 0, n: 0 }; const c = byClass[k]; c.mb = Number((c.mb + r.mb).toFixed(2)); c.n++; }
  const inScene = rows.filter((r) => r.where !== '(not in scene)').reduce((s, r) => s + r.mb, 0);
  const mem = performance.memory ? performance.memory.usedJSHeapSize : 0;
  const info = g ? g.renderer.info.memory : {};
  const ext = g ? g.renderer.getContext().getSupportedExtensions().filter((e) => e.includes('compressed')) : [];
  return {
    textureMB: mb(texBytes), compressedMB: mb(compressedBytes), textures: n, compressedTextures: nComp,
    inSceneMB: Number(inScene.toFixed(1)), renderTargetMB: mb(rtBytes), renderbufferMB: mb(rbBytes),
    jsHeapMB: mb(mem), threeInfo: info, compressedExtensions: ext, byFormat: byFmt, byClass, fetched: [...new Set([...P.urls, ...performance.getEntriesByType('resource').map((e) => { try { return new URL(e.name).pathname; } catch { return ''; } })])].filter((u) => u.startsWith('/assets/') && /\.(glb|gltf|ktx2|webp|jpg|png)$/.test(u)).sort((a, b) => a.localeCompare(b)), top: rows.slice(0, top), all: rows,
  };
}
