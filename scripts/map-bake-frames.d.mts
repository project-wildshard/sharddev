import type {JSHandle} from 'playwright';
import type {ByteSinkPage} from '@wildshard/engine/scripts/bake-output.mjs';
/** Save native map passes and always retire their owned handles/routes. */
export function saveMapFrames<T extends {colour:HTMLCanvasElement;height:HTMLCanvasElement|null}>(page:ByteSinkPage,handle:JSHandle<T>,colourFile:string,heightFile:string):Promise<Omit<T,'colour'|'height'>&{hasHeight:boolean}>;
