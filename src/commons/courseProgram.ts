import { parseDecisionScripts, type DecisionScriptRow } from '@wildshard/format/decisionScripts';
import type { DecisionRegistries } from '@wildshard/sdk/decisionBindingMap';

/** The shared course's original aliases, handles, fixed page and author ceiling. */
export interface CourseProgramInputs {
  readonly row: DecisionScriptRow;
  readonly registries: DecisionRegistries;
  readonly source: string;
  readonly options: { readonly asLineCeiling: 256; readonly singleSignal: true };
}

/** Construct the same complete course contract for either injected or retained Node compilation.
 * A compiled identity binds the admitted metadata to the caller's actual source/module bytes. */
export function courseProgramInputs(kind: 'oval' | 'checkpoints', parameters: Readonly<Record<string, number>> = {},
  compiled?: { readonly module: string; readonly sourceHash: string }): CourseProgramInputs {
  const padFields = Array.from({ length: 11 }, (_, index) => ['Depth','Eligible','Pitch','StartPitch','StartYaw','Top','Width','X','Yaw','Z'].map(key => `pad${String(index).padStart(2,'0')}${key}`)).flat();
  const state = ['lap','started','running','half','best','last','prevX','phase','elapsed','checkpoint','visited'];
  const fields = [...state,'now','x','y','z','mounted','grounded','startPad','finishPad','padCount','fallY','lowest','courseX','courseY','courseZ','courseTime','courseMounted',...padFields];
  const channels = [...state,'courseEvent','courseFell','reached','visit','finish','fell','pad','spawnX','spawnY','spawnZ','spawnYaw','spawnPitch'];
  const signals = ['reset','step','restart','courseReset','courseStep'];
  const aliases = (names: readonly string[]): Record<string,string> => Object.fromEntries(names.map(name => [name,name]));
  const registry = (names: readonly string[]): Map<string,number> => new Map([...names].sort().map((name,index) => [name,index+1]));
  const source = 'behaviour/course.as';
  const rows = parseDecisionScripts([{ id: 'practice.course', abi:'1.0',side:'sim',module:compiled?.module ?? `blobs/wasm/${'0'.repeat(64)}.wasm`,source,
    ...(compiled === undefined ? {} : { sourceHash: compiled.sourceHash }),
    binding:{shard:true},pages:1,onFail:'hold',on:['signal'],tick:null,stateVersion:1,state:[],
    params:{ courseKind:kind==='oval'?0:1,courseRadius:0,courseWidth:0,courseLine:0,resetX:0,resetZ:0,resetYaw:0,resetPitch:0,resetPrevX:0,...parameters },
    reads:['field'],commands:['channel'],fields:aliases(fields),channels:aliases(channels),signals:aliases(signals) }]);
  const row = rows[0]; if (row === undefined) throw new Error('Missing shared course contract');
  return { row, source, registries: { fields: registry(fields), channels: registry(channels), signals: registry(signals) },
    options: { asLineCeiling: 256, singleSignal: true } };
}
