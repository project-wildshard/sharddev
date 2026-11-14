import { dot, max, mix, screenUV, smoothstep, vec3 } from 'three/tsl';
import { graph, graphInputs, noise, sceneDepth } from '@wildshard/sdk/materials';
import type { GraphIr } from '@wildshard/format/materialGraph';

// The Template's sky post pass, kept here so the Template's own hero stamp stays true (data/look.json post[0], 77 graph nodes) as TSL (SHARD-SOURCE AP13): a five-band dusk,
// a sun glow, halo and disc, three octaves of cloud, the vignette. `graph()` compiles it to the same graph.
export function templateSky(): GraphIr {
  const { sceneColour, viewRay } = graphInputs;
  const rgb = sceneColour.xyz.toVar('rgb'), sky = smoothstep(400, 480, sceneDepth().toVar('depth')).toVar('sky');
  const ray = viewRay.toVar('ray'), h = ray.y.toVar('h'), e = max(h, 0).toVar('e');
  const sd = max(dot(ray, vec3(0.30461, 0.03332, -0.9519)), 0).toVar('sd');
  const band = (from: ReturnType<typeof mix>, to: [number, number, number], a: number, b: number): ReturnType<typeof mix> => mix(from, vec3(...to), smoothstep(a, b, e));
  const bands = band(band(band(mix(vec3(1, 0.4793, 0.1878), vec3(0.9387, 0.2623, 0.2159), smoothstep(0.07, 0.19, e)),
    [0.4342, 0.1559, 0.3613], 0.15, 0.26), [0.0931, 0.0844, 0.3613], 0.22, 0.42), [0.0252, 0.0319, 0.2232], 0.4, 0.75);
  const glow = vec3(1, 0.62, 0.36).mul(sd.pow(6).mul(0.4).mul(smoothstep(0, 0.4, e).oneMinus()));
  const halo = vec3(1, 0.7913, 0.4342).mul(sd.pow(120).mul(0.35));
  const disc = vec3(1, 0.85, 0.6).mul(smoothstep(0.99935, 0.9997, sd).mul(0.9));
  const p = ray.xz.div(max(h.add(0.08), 0.04)).mul(1.6);
  const n3 = noise(p.mul(2.4).add(9));
  const octaves = noise(p.mul(0.55).add(4)).mul(0.6).add(noise(p.mul(1.15).add(17)).mul(0.3)).add(n3.mul(0.22));
  const cloud = smoothstep(0.1, 0.24, octaves).mul(smoothstep(0.04, 0.1, h).mul(smoothstep(0.3, 0.5, h).oneMinus())).toVar('cloud');
  const lit = mix(mix(vec3(1, 0.46, 0.46), vec3(1, 0.56, 0.32), sd.mul(sd)).mul(0.86), vec3(0.2667, 0.1175, 0.3432), smoothstep(-0.2, 0.4, n3).mul(0.35));
  const skyCol = mix(bands.add(glow).add(halo).add(disc), lit.mul(mix(1, 0.72, smoothstep(0.14, 0.45, e))), cloud.mul(0.92)).mul(0.95).toVar('skyCol');
  const vd = screenUV.toVar('uv').sub(0.5).toVar('vd');
  const vig = smoothstep(0.2, 0.75, dot(vd, vd).toVar('vr')).mul(0.22).oneMinus().toVar('vig');
  return graph({ kind: 'post', post: { colour: mix(rgb, skyCol, sky).toVar('scene').mul(vig).toVar('out') } });
}
