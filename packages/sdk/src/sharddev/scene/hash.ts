/** AP1: a small, stable content hash for scene parts (two FNV-1a lanes, 64 bits as hex). Not a security hash: it only
 *  tells a re-run which parts changed. Pure JavaScript, so it runs in an author bundle and in the dev page alike. */
export class ContentHash {
  private a = 0x811c9dc5;
  private b = 0x01000193 ^ 0x5bd1e995;
  bytes(view: ArrayBufferView): this {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let a = this.a, b = this.b;
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i] ?? 0;
      a = Math.imul(a ^ byte, 0x01000193);
      b = Math.imul(b ^ byte, 0x5bd1e995) ^ (b >>> 15);
    }
    this.a = a; this.b = b;
    return this;
  }
  text(value: string): this { return this.bytes(new TextEncoder().encode(`${value}\u0000`)); }
  numbers(values: readonly number[]): this { return this.bytes(Float64Array.from(values)); }
  json(value: unknown): this { return this.text(JSON.stringify(value)); }
  hex(): string { return (this.a >>> 0).toString(16).padStart(8, '0') + (this.b >>> 0).toString(16).padStart(8, '0'); }
}

export const hashOf = (fill: (hash: ContentHash) => void): string => { const hash = new ContentHash(); fill(hash); return hash.hex(); };
