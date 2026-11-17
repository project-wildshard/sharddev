import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import originals from '../../kit/content/journal-icons.json' with { type: 'json' };

const root = new URL('../../kit/content/journal-icons/', import.meta.url);
const check = process.argv.includes('--check');
if (!check) mkdirSync(root, { recursive: true });
for (const [name, source] of Object.entries(originals)) {
  const xml = source.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" ');
  const bytes = await sharp(Buffer.from(xml)).png({ compressionLevel: 9 }).toBuffer();
  const target = new URL(`${name}.png`, root);
  if (check) {
    if (!readFileSync(target).equals(bytes)) throw new Error(`Stale journal icon: ${name}`);
  } else writeFileSync(target, bytes);
}
console.info(`Journal icons ${check ? 'checked' : 'built'}: 7 at ${fileURLToPath(root)}`);
