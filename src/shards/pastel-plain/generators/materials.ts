import { Color, SRGBColorSpace } from 'three';
import { dot, mix, normalView, normalWorld, positionViewDirection, positionWorld, saturate, smoothstep, vec3 } from 'three/tsl';
import { GraphMaterial, PainterlyMaterial, graph, graphInputs, noise, param } from '@wildshard/sharddev/materials';

/**
 * The pastel alien plain's materials authored with `@wildshard/sharddev/materials` (DS1.4): `ground` is a `PainterlyMaterial`
 * in lilac written as the painterly graph preset, and `rock` is the lit pastel graph written in TSL and compiled by
 * `graph()`. They are the source of `data/look.json`'s `ground` and `data/rock.graph.json`;
 * `test/sdk-materials-parity.test.ts` holds them equal (same nodes, params and stages).
 */
export function pastelGround(): PainterlyMaterial {
  return new PainterlyMaterial({ color: new Color().setRGB(0.82, 0.74, 0.9, SRGBColorSpace), graphPreset: true });
}

/**
 * The rock: a height gradient from pink foot to peach top, a half-Lambert pastel ramp whose shadow is a cool tint, a
 * mint rim, a sky / ground ambient and a lifted, softened grade.
 */
export function pastelRock(): GraphMaterial {
  const { sunDirection, sunColour, sunShadow, albedo, irradiance, litColour } = graphInputs;
  const foot = param('foot', { type: 'colour', value: [0.98, 0.72, 0.82] });
  const top = param('top', { type: 'colour', value: [1, 0.88, 0.7] });
  const warm = param('warm', { type: 'colour', value: [1, 0.93, 0.86] });
  const cool = param('cool', { type: 'colour', value: [0.72, 0.7, 0.98] });
  const rim = param('rim', { type: 'colour', value: [0.62, 1, 0.86] });
  const sky = param('sky', { type: 'colour', value: [0.8, 0.78, 1] });
  const ground = param('ground', { type: 'colour', value: [0.75, 0.95, 0.85] });
  const rimStrength = param('rimStrength', { type: 'float', value: 0.45, min: 0, max: 2 });
  const shadowTint = param('shadowTint', { type: 'float', value: 0.55, min: 0, max: 1 });
  const lift = param('lift', { type: 'float', value: 0.18, min: 0, max: 1 });
  const saturation = param('saturation', { type: 'float', value: 0.8, min: 0, max: 2 });

  // the height gradient, broken up by a little noise
  const height = saturate(saturate(positionWorld.y.mul(0.3)).add(noise(positionWorld.xz.mul(0.08)).mul(0.15)));
  const base = mix(foot, top, height);
  // the half-Lambert ramp; cast shadow tints toward cool instead of darkening
  const wrap1 = dot(normalView, sunDirection).mul(0.5).add(0.5);
  const rampK = wrap1.mul(wrap1).mul(sunShadow.oneMinus().mul(shadowTint).oneMinus());
  const diffuse = albedo.mul(mix(cool, warm, rampK)).mul(sunColour).mul(rampK).mul(0.3183098861837907);
  // the mint rim
  const fresnel = smoothstep(0.2, 1, saturate(dot(normalView, positionViewDirection)).oneMinus());
  const rimTerm = rim.mul(fresnel).mul(rimStrength).mul(sunColour).mul(0.25);
  // the sky / ground ambient over the engine's irradiance
  const hemi = mix(ground, sky, normalWorld.y.mul(0.5).add(0.5));
  const ambient = irradiance.add(hemi).mul(albedo).mul(0.3183098861837907);
  // the grade: a little desaturated, lifted toward white
  const luminance = dot(litColour, vec3(0.2126, 0.7152, 0.0722));
  const graded = mix(mix(luminance, litColour, saturation), vec3(1, 1, 1), lift);

  return new GraphMaterial(graph({
    model: 'standard',
    surface: { colour: base, roughness: 0.9, metalness: 0, emissive: 0 },
    lighting: { sun: diffuse.add(rimTerm), ambient, grade: graded },
  }));
}
