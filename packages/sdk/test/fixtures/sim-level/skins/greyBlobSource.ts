import type { SpeciesRow } from '../../../../src/server/engine/ai/species';
import type { SpeciesLook } from '../../../../src/client/engine/entities/species/look';
import { NO_FUR } from '../../../../src/shared/engine/entities/species/rigs';
import { SphereGeometry, Float32BufferAttribute, Uint16BufferAttribute } from 'three';

/**
 * The SF9c export source for the template's grey blob: the procedural recipe the legacy template plugin drew it with,
 * kept here so the export no longer reads `src/shards/_template/species/greyBlob.ts` (retired with the template chunk at
 * SF16). It has no brain: the export poses it through Animal's own timers, never through think / act.
 */
export const GREY_BLOB_SOURCE: SpeciesRow = { id: 'template.creature.greyBlob', kind: 'greyBlob', label: 'Grey blob', aggressive: true, blood: false,
  variants: [{ id: 'grey', label: 'Grey blob', weight: 1, rarity: 'common', scale: [1, 1], hp: 60 }, { id: 'big', label: 'Big blob', weight: 0, rarity: 'rare', scale: [1.8, 1.8], hp: 180 }] };
/** The legacy look, byte for byte: a 10 × 6 sphere, grey vertex colour, two joints and the body's breathing scale wave. */
export const GREY_BLOB_SOURCE_LOOK: SpeciesLook = { id: 'template.look.greyBlob', species: GREY_BLOB_SOURCE.id, kind: 'greyBlob', rig: 'custom', fur: NO_FUR,
  rigContract: { skeleton: 'template.greyBlob', sockets: ['body', 'head'], clips: ['idle', 'walk', 'attack', 'hit', 'die'] },
  build: () => { const geometry = new SphereGeometry(0.65, 10, 6); geometry.translate(0, 0.65, 0);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('color', new Float32BufferAttribute(Array.from({ length: count * 3 }, () => 0.45), 3));
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
    return { bones: [{ name: 'body', parent: null, pos: [0, 0.65, 0] }, { name: 'head', parent: 'body', pos: [0, 1, 0] }], furParts: [], hardParts: [geometry], eyeParts: [],
      dims: { bodyY: 0.65, bodyHalfLen: 0.4, bodyRadius: 0.55, headRadius: 0.3, legLen: 0.6, feet: [], halfWidth: 0.65 } }; },
  animate: ({ bones, t, alive }) => { const body = bones['body']; if (body) body.scale.set(1, alive ? 1 + Math.sin(t * 4) * 0.08 : 0.4, 1); },
};
