import { Color, SRGBColorSpace } from 'three';
import { dot, floor, length, mix, normalize, normalLocal, normalView, cameraPosition, positionViewDirection, positionWorld, saturate, select, smoothstep, step, vec3 } from 'three/tsl';
import { GraphMaterial, ToonMaterial, graph, graphInputs, param } from '@wildshard/sharddev/materials';

/**
 * The ink / cel valley's materials authored with `@wildshard/sharddev/materials` (DS1.4): `ground` is a `ToonMaterial` in
 * sage green written as the toon graph preset, and `rock` is the cel graph written in TSL and compiled by `graph()`.
 * They are the source of `data/look.ts`'s `ground` and `data/rock.graph.json`; `test/sdk-materials-parity.test.ts`
 * holds them equal (same nodes, params and stages), so the shipped look is what this file says.
 */
export function inkGround(): ToonMaterial {
  return new ToonMaterial({ color: new Color().setRGB(0.56, 0.61, 0.37, SRGBColorSpace), graphPreset: true });
}

/**
 * The rock: flat paper untinted by the props' vertex colours, the sun in three hard bands over a flat ink-wash shade, a
 * silhouette line, a light posterise and the outline stage's inverted hull.
 */
export function inkRock(): GraphMaterial {
  const { sunDirection, sunColour, sunShadow, litColour } = graphInputs;
  const paper = param('paper', { type: 'colour', value: [0.93, 0.89, 0.78] });
  const wash = param('wash', { type: 'colour', value: [0.42, 0.5, 0.62] });
  const ink = param('ink', { type: 'colour', value: [0.06, 0.05, 0.08] });
  const outlineWidth = param('outlineWidth', { type: 'float', value: 0.004, min: 0, max: 0.05 });
  const silhouette = param('silhouette', { type: 'float', value: 0.28, min: 0, max: 1 });
  const bands = param('bands', { type: 'float', value: 3, min: 1, max: 8 });
  const shade = param('shade', { type: 'float', value: 0.35, min: 0, max: 1 });

  // the sun in `bands` hard steps; the shade side takes the ink wash
  const cel = floor(saturate(dot(normalView, sunDirection)).mul(sunShadow).mul(bands).add(0.5)).div(bands);
  const tone = select(cel.greaterThan(0.01), vec3(1, 1, 1), wash);
  const diffuse = paper.mul(sunColour).mul(cel).mul(tone).mul(0.3183098861837907);
  // the silhouette line: surfaces seen edge-on go unlit (the ink grade below darkens them)
  const keep = step(dot(normalView, positionViewDirection), silhouette).oneMinus();
  const ambient = wash.mul(paper).mul(shade).mul(keep);
  // a light posterise, then near-black pixels pulled to ink
  const posterised = mix(litColour, floor(litColour.mul(8)).div(8), 0.5);
  const dark = smoothstep(0.03, 0.01, dot(posterised, vec3(0.2126, 0.7152, 0.0722)));
  // the inverted hull: pushed out along the normal by a constant screen width
  const hull = normalize(normalLocal).mul(length(positionWorld.sub(cameraPosition)).mul(outlineWidth));

  return new GraphMaterial(graph({
    model: 'standard', flatShading: true,
    surface: { colour: paper, roughness: 1, metalness: 0, emissive: 0 },
    lighting: { sun: diffuse.mul(keep), ambient, grade: mix(posterised, ink, dark) },
    outline: { offset: hull, colour: ink },
  }));
}
