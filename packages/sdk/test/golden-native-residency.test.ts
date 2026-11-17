import {expect,test} from 'vitest';
import {refinementExports,observeRefinement,workingGoldenPreviewFolder} from '../scripts/goldens/native-residency.mjs';

test('working candidate binding uses its actual preview registry folder',()=>{
  expect(workingGoldenPreviewFolder('2333 1793726377 /repo/tmp/serve/candidate agent candidate-name\n')).toBe('/repo/tmp/serve/candidate');
  expect(workingGoldenPreviewFolder('2333 1793726377 /repo with spaces/tmp/candidate agent name')).toBe('/repo with spaces/tmp/candidate');
  for(const value of ['','2333 1793726377 relative/path agent name','2333 /repo/tmp/candidate'])
    expect(()=>workingGoldenPreviewFolder(value)).toThrow('Invalid working preview');
});

test('native binding follows compiler exports and refuses guessed or ambiguous identities',()=>{
  const source='function boot$(){return(1)};C$=class{view;waiting=new Map;known=new Set};export{boot$ as init,C$ as Queue}';
  expect(refinementExports(source)).toEqual({initializerExport:'init',classExport:'Queue'});
  for (const invalid of ['',source.replace('C$ as Queue','Other as Queue'),`${source};D=class{view;waiting=new Map;known=new Set}`])
    expect(()=>refinementExports(invalid)).toThrow();
});

test('publication observer preserves receiver, argument identities and the original promise',async()=>{
  let publish:((value:boolean)=>void)|undefined;
  const original=new Promise<boolean>(resolve=>{publish=resolve;});
  const at={x:2,z:3},run=()=>Promise.resolve();
  const proto={value:4,add(id:string,point:typeof at,work:typeof run):Promise<boolean> {
    expect(this.value).toBe(4);expect(id).toBe('job');expect(point).toBe(at);expect(work).toBe(run);return original;
  }};
  const ledger=observeRefinement(proto);
  expect(proto.add('job',at,run)).toBe(original);
  expect(ledger.jobs[0]?.state).toBe('pending');
  if (publish===undefined) throw new Error('Missing publication resolver');publish(true);await original;
  expect(ledger.jobs[0]).toEqual({id:'job',at,state:'published'});
});

test('publication observer distinguishes retired and failed jobs',async()=>{
  const retired=Promise.resolve(false),failure=Promise.reject(new Error('read failed'));
  const proto={add(id:string) {return id==='retire'?retired:failure;}};
  const ledger=observeRefinement(proto);
  expect(proto.add('retire')).toBe(retired);expect(proto.add('fail')).toBe(failure);
  await Promise.allSettled([retired,failure]);
  expect(ledger.jobs.map(row=>row.state)).toEqual(['retired','failed']);
  expect(ledger.jobs[1]?.error).toContain('read failed');
});
