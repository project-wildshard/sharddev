import { bakeProps, type BakedProps } from '@wildshard/sdk/bake/props';
import { templateProps } from './templatePropsSource';

/** The original authored meshes and scatter baked in memory, without publishing intermediate files. */
export function templatePropRows(): BakedProps {
  const fixture = templateProps(20);
  try { return bakeProps(fixture.source); }
  finally { fixture.dispose(); }
}
