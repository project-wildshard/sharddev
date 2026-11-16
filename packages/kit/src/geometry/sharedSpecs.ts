export const TREE_SPECS = [
  { height: 22, trunk: 0.42, seed: 1 },
  { height: 17, trunk: 0.34, seed: 2 },
  { height: 26, trunk: 0.5, seed: 3 },
  { height: 13, trunk: 0.27, seed: 4 },
] as const

export const BARREL_BODY: {
  readonly shape: {
    readonly cylinder: { readonly radius: 0.38; readonly halfHeight: 0.475 }
  }
  readonly material: 'wood'
  readonly density: 250
  readonly friction: 1
  readonly angularDamping: 0.2
  readonly rolling: 0.06
  readonly keep: true
} = {
  shape: { cylinder: { radius: 0.38, halfHeight: 0.475 } },
  material: 'wood',
  density: 250,
  friction: 1.0,
  angularDamping: 0.2,
  rolling: 0.06,
  keep: true,
} as const
