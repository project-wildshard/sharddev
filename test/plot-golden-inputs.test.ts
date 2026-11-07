import {describe,it,expect} from 'vitest';
import {parsePlotGoldens,plotGoldenCamera,plotGoldenPlacement} from '../scripts/goldens/plot-inputs.mjs';
import cameras from './fixtures/open-plot-golden-cameras.json' with {type:'json'};

describe('open plot golden cameras',()=>{
  it('admits the six maintained eight-view local/world camera fixtures',()=>{
    expect(Object.keys(cameras)).toHaveLength(6);
    for (const input of Object.values(cameras)) {
      const plan=parsePlotGoldens(input);
      expect(plan.views).toHaveLength(8);
      for (const view of plan.views) expect(plotGoldenCamera(view,plan.origin)).toEqual(view.world);
    }
  });
  it('rebases by served product identity after a grid move and retains provenance',()=>{
    const plan=parsePlotGoldens(cameras['night-market']);
    const grid={pitch:562.5,cells:[{slug:plan.slug,instance:'open-plot-new',cell:[2,-1] as const}]};
    expect(plotGoldenPlacement(plan,grid)).toEqual({instance:'open-plot-new',origin:{x:1125,z:-562.5},pitch:562.5,
      sourceInstance:plan.instance,sourceOrigin:plan.origin});
    expect(()=>plotGoldenPlacement(plan,{...grid,cells:[]})).toThrow();
    expect(()=>plotGoldenPlacement(plan,{...grid,cells:[...grid.cells,...grid.cells]})).toThrow();
    expect(()=>plotGoldenPlacement(plan,{cells:grid.cells})).toThrow();
  });
  it('refuses truncated sets, stale world coordinates and out-of-cell player anchors',()=>{
    const plan=parsePlotGoldens(cameras['night-market']);
    expect(()=>parsePlotGoldens({...plan,views:plan.views.slice(1)})).toThrow();
    const first=plan.views[0];if (first===undefined) throw new Error('Missing fixture view');
    expect(()=>parsePlotGoldens({...plan,views:[{...first,world:{...first.world,fov:30}},...plan.views.slice(1)]})).toThrow();
    expect(()=>parsePlotGoldens({...plan,views:[{...first,player:[251,0]},...plan.views.slice(1)]})).toThrow();
  });
});
