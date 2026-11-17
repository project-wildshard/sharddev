import {createHash} from 'node:crypto';

/** The existing texture producer and blob split use one recipe identity; a stale source/settings cache misses. */
export const COMMON=['-ktx2','-mipmap','-mip_filter','box','-max_threads','4'];
export const CLASS={
 color:['-uastc','-uastc_level','2','-srgb','-ktx2_zstandard_level','20'],
 normal:['-uastc','-uastc_level','2','-normal_map','-ktx2_zstandard_level','20'],
 linear:['-uastc','-uastc_level','2','-linear','-ktx2_zstandard_level','20'],
 data:['-etc1s','-q','255','-linear'],
};
/** G738 (Jake, D2 c): the much smaller, softer format only for far textures: a far GLB's colour images as ETC1S. */
export const FAR=['-etc1s','-q','255','-srgb'];
/** Resolve only an encode of these source bytes, this encoder version and these defining settings (`far`: the FAR colour
 *  encode, keyed apart so no other GLB's key changes). */
export function glbKtx2Key(bytes,encoder,far=false){
 const sha=value=>createHash('sha256').update(value).digest('hex');
 return sha(`${sha(bytes)}|glb2|${encoder}|${JSON.stringify(CLASS)}|${COMMON.join(' ')}${far?`|far ${FAR.join(' ')}`:''}`);
}
