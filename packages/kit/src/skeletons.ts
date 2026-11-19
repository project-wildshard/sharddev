import {
  CREATURE_SKELETONS,
  type FixedSkeleton,
} from '@wildshard/shard-format/creatureSkeletons'
import {
  BoxGeometry,
  BufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import deer from '../content/creatures/deer.json' with { type: 'json' }
import wolf from '../content/creatures/wolf.json' with { type: 'json' }
import { biped, type BodyOptions } from './body.ts'

import type {
  CreatureBody,
  CreatureSkeleton,
} from '@wildshard/shard-format/creatureLayers'
import type { ShardRows } from '@wildshard/shard-format/rows'

type Point = readonly [number, number, number]
export interface ReferenceSkeletonSource {
  readonly name: string
  readonly skeleton: CreatureSkeleton
  readonly bones: readonly {
    readonly name: string
    readonly parent: string | null
    readonly pos: Point
  }[]
  readonly parts: readonly {
    readonly geometry: BufferGeometry
    readonly material: MeshStandardMaterial
    readonly name: string
  }[]
  readonly dims: ShardRows['species'][number]['dims']
}
/** Geometry is copied from the named socket's local frame. */
export interface HumanoidAttachment {
  readonly socket: string
  readonly geometry: BufferGeometry
  readonly at?: Point
}
export interface HumanoidOptions extends BodyOptions {
  /** Replacement head geometry in the head bone's local frame. */
  readonly head?: BufferGeometry
  readonly attachments?: readonly HumanoidAttachment[]
}
export interface HumanoidSource extends ReferenceSkeletonSource {
  readonly body: CreatureBody
}

/** A unit rig and existing body scale policy, applied once at runtime. */
export function humanoidSource(
  options: Readonly<HumanoidOptions>,
): HumanoidSource {
  const body = biped({
    look: options.look,
    ...(options.size === undefined ? {} : { size: options.size }),
    ...(options.scale === undefined ? {} : { scale: options.scale }),
  })
  const sockets = CREATURE_SKELETONS.biped.sockets
  for (const attachment of options.attachments ?? []) {
    if (!Object.hasOwn(sockets, attachment.socket))
      throw new Error(`Unknown biped socket ${attachment.socket}`)
    if (attachment.at?.some(value => !Number.isFinite(value)))
      throw new Error(`Non-finite biped socket offset ${attachment.socket}`)
    validateSurface(attachment.geometry, attachment.socket)
  }
  if (options.head !== undefined) validateSurface(options.head, 'head')
  return { ...buildReference('biped', options), body }
}
function validateSurface(geometry: BufferGeometry, label: string): void {
  const position = geometry.getAttribute('position')
  if (position === undefined || position.itemSize !== 3 || position.count === 0)
    throw new Error(`Kit ${label} needs nonempty 3D positions`)
  for (let i = 0; i < position.count; i++)
    if (
      ![position.getX(i), position.getY(i), position.getZ(i)].every(
        Number.isFinite,
      )
    )
      throw new Error(`Kit ${label} has a non-finite position`)
}
const POINTS: Readonly<Record<FixedSkeleton, Readonly<Record<string, Point>>>> =
  {
    biped: {
      body: [0, 0, 0],
      hips: [0, 0.9, 0],
      spine: [0, 1.08, 0],
      chest: [0, 1.3, 0],
      neck: [0, 1.48, 0],
      head: [0, 1.68, 0],
      'upperArm.L': [0.24, 1.36, 0],
      'forearm.L': [0.4, 1.14, 0.02],
      'hand.L': [0.45, 0.96, 0.04],
      'upperArm.R': [-0.24, 1.36, 0],
      'forearm.R': [-0.4, 1.14, 0.02],
      'hand.R': [-0.45, 0.96, 0.04],
      'thigh.L': [0.14, 0.9, 0],
      'shin.L': [0.14, 0.47, 0.02],
      'foot.L': [0.14, 0.06, 0.1],
      'thigh.R': [-0.14, 0.9, 0],
      'shin.R': [-0.14, 0.47, 0.02],
      'foot.R': [-0.14, 0.06, 0.1],
    },
    quadruped: {
      body: [0, 0.62, 0],
      neck1: [0, 0.72, 0.5],
      neck2: [0, 0.85, 0.67],
      head: [0, 0.87, 0.91],
      tail: [0, 0.63, -0.72],
      FL_shoulder: [0.23, 0.58, 0.4],
      FL_carpus: [0.23, 0.3, 0.43],
      FL_fetlock: [0.23, 0.06, 0.47],
      FR_shoulder: [-0.23, 0.58, 0.4],
      FR_carpus: [-0.23, 0.3, 0.43],
      FR_fetlock: [-0.23, 0.06, 0.47],
      BL_hip: [0.23, 0.6, -0.43],
      BL_stifle: [0.23, 0.32, -0.4],
      BL_hock: [0.23, 0.06, -0.43],
      BR_hip: [-0.23, 0.6, -0.43],
      BR_stifle: [-0.23, 0.32, -0.4],
      BR_hock: [-0.23, 0.06, -0.43],
    },
  }
const COLOUR = {
  body: [0.45, 0.48, 0.52],
  dark: [0.24, 0.27, 0.31],
  head: [0.67, 0.63, 0.57],
} as const

type Wildlife = 'deer' | 'wolf'
const QUADRUPED_LEGS = ['front.L', 'front.R', 'back.L', 'back.R'] as const
const WILDLIFE = {
  deer: {
    dims: deer.species.dims,
    coat: [0.35, 0.18, 0.08],
    face: [0.49, 0.29, 0.15],
    legs: [0.16, 0.095, 0.06],
    chestLift: 0.15,
    headLift: 0.66,
    snout: 0.18,
    ears: 0.12,
    tail: 0.16,
  },
  wolf: {
    dims: wolf.species.dims,
    coat: [0.26, 0.26, 0.24],
    face: [0.42, 0.39, 0.33],
    legs: [0.18, 0.17, 0.15],
    chestLift: 0.04,
    headLift: 0.22,
    snout: 0.25,
    ears: 0.09,
    tail: 0.37,
  },
} as const

/** Source bodies on the same named chains as the quadruped clip pack. */
export function wildlifeSource(kind: Wildlife): ReferenceSkeletonSource {
  return buildReference('quadruped', {}, kind)
}

function wildlifePoints(kind: Wildlife): Readonly<Record<string, Point>> {
  const profile = WILDLIFE[kind],
    { bodyY, bodyHalfLen, feet } = profile.dims
  const points: Record<string, Point> = {
    body: [0, bodyY, 0],
    neck1: [0, bodyY + profile.chestLift, bodyHalfLen * 0.76],
    neck2: [0, bodyY + profile.headLift * 0.7, bodyHalfLen * 1.03],
    head: [0, bodyY + profile.headLift, bodyHalfLen * 1.28],
    tail: [0, bodyY + 0.03, -bodyHalfLen],
  }
  for (const [index, name] of QUADRUPED_LEGS.entries()) {
    const [upper, knee, foot] =
        CREATURE_SKELETONS.quadruped.chains[name]?.bones ?? [],
      at = feet[index]
    if (
      upper === undefined ||
      knee === undefined ||
      foot === undefined ||
      at === undefined
    )
      throw new Error('Missing Kit wildlife leg')
    const [x = 0, z = 0] = at
    points[upper] = [x, bodyY - 0.04, z]
    points[knee] = [x, bodyY * 0.48, z + (index < 2 ? -0.045 : 0.065)]
    points[foot] = [x, 0.075, z]
  }
  return points
}

/** Build-time reference data. The defining table owns hierarchy/names; these
 * coordinates and simple surfaces are authored kit geometry, with no SDK host. */
export function referenceSkeletonSource(
  skeleton: FixedSkeleton,
): ReferenceSkeletonSource {
  return buildReference(skeleton)
}
function buildReference(
  skeleton: FixedSkeleton,
  options: Readonly<Pick<HumanoidOptions, 'head' | 'attachments'>> = {},
  wildlife?: Wildlife,
): ReferenceSkeletonSource {
  const contract = CREATURE_SKELETONS[skeleton],
    positions =
      wildlife === undefined ? POINTS[skeleton] : wildlifePoints(wildlife)
  const point = (name: string): Point => {
    const value = positions[name]
    if (value === undefined)
      throw new Error(`Missing kit reference joint ${name}`)
    return [value[0], value[1], value[2]]
  }
  const bones = [
    {
      name: contract.root,
      parent: null as string | null,
      pos: point(contract.root),
    },
  ]
  for (const chain of Object.values(contract.chains)) {
    let parent = chain.parent
    for (const name of chain.bones) {
      bones.push({ name, parent, pos: point(name) })
      parent = name
    }
  }
  const fragments: BufferGeometry[] = []
  const add = (
    geometry: BufferGeometry,
    bone: string,
    at: Point,
    size: Point,
    colour: Point,
    rotation = new Quaternion(),
    preserveColour = false,
  ): void => {
    const index = bones.findIndex(row => row.name === bone)
    if (index === -1) throw new Error(`Unknown kit surface joint ${bone}`)
    const plain = geometry.index === null ? geometry : geometry.toNonIndexed()
    if (plain !== geometry) geometry.dispose()
    plain.applyMatrix4(
      new Matrix4().compose(new Vector3(...at), rotation, new Vector3(...size)),
    )
    if (plain.getAttribute('normal') === undefined) plain.computeVertexNormals()
    const originalColour = preserveColour
      ? plain.getAttribute('color')
      : undefined
    for (const name of Object.keys(plain.attributes))
      if (!['position', 'normal'].includes(name)) plain.deleteAttribute(name)
    const count = plain.getAttribute('position').count,
      indices = new Uint16Array(count * 4),
      weights = new Float32Array(count * 4),
      colours = new Float32Array(count * 3)
    for (let vertex = 0; vertex < count; vertex++) {
      indices[vertex * 4] = index
      weights[vertex * 4] = 1
      colours.set(
        originalColour === undefined
          ? colour
          : [
              originalColour.getX(vertex),
              originalColour.getY(vertex),
              originalColour.getZ(vertex),
            ],
        vertex * 3,
      )
    }
    plain.setAttribute('skinIndex', new BufferAttribute(indices, 4))
    plain.setAttribute('skinWeight', new BufferAttribute(weights, 4))
    plain.setAttribute('color', new BufferAttribute(colours, 3))
    fragments.push(plain)
  }
  const box = (bone: string, at: Point, size: Point, colour: Point): void =>
    add(new BoxGeometry(1, 1, 1), bone, at, size, colour)
  const sphere = (bone: string, at: Point, size: Point, colour: Point): void =>
    add(new SphereGeometry(1, 8, 6), bone, at, size, colour)
  const limb = (
    bone: string,
    end: string,
    width: number,
    colour: Point,
  ): void => {
    const from = new Vector3(...point(bone)),
      to = new Vector3(...point(end)),
      delta = to.clone().sub(from),
      mid = from.add(to).multiplyScalar(0.5)
    add(
      new BoxGeometry(1, 1, 1),
      bone,
      [mid.x, mid.y, mid.z],
      [width, delta.length(), width],
      colour,
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        delta.normalize(),
      ),
    )
  }
  if (skeleton === 'biped') {
    box('chest', [0, 1.23, 0], [0.44, 0.42, 0.25], COLOUR.body)
    box('hips', [0, 0.91, 0], [0.3, 0.18, 0.23], COLOUR.dark)
    limb('neck', 'head', 0.1, COLOUR.head)
    if (options.head === undefined)
      sphere('head', point('head'), [0.16, 0.16, 0.16], COLOUR.head)
    else
      add(
        options.head.clone(),
        'head',
        point('head'),
        [1, 1, 1],
        COLOUR.head,
        new Quaternion(),
        true,
      )
    for (const side of ['L', 'R']) {
      limb(`upperArm.${side}`, `forearm.${side}`, 0.105, COLOUR.body)
      limb(`forearm.${side}`, `hand.${side}`, 0.085, COLOUR.head)
      sphere(
        `hand.${side}`,
        point(`hand.${side}`),
        [0.065, 0.07, 0.065],
        COLOUR.head,
      )
      limb(`thigh.${side}`, `shin.${side}`, 0.13, COLOUR.dark)
      limb(`shin.${side}`, `foot.${side}`, 0.105, COLOUR.dark)
      box(`foot.${side}`, point(`foot.${side}`), [0.14, 0.1, 0.27], COLOUR.dark)
    }
  } else if (wildlife !== undefined) {
    const profile = WILDLIFE[wildlife],
      dims = profile.dims
    const [hx, hy, hz] = point('head'),
      [tx, ty, tz] = point('tail')
    sphere(
      'body',
      point('body'),
      [dims.halfWidth, dims.bodyRadius * 0.8, dims.bodyHalfLen],
      profile.coat,
    )
    limb('neck1', 'neck2', dims.bodyRadius * 0.72, profile.coat)
    limb('neck2', 'head', dims.bodyRadius * 0.58, profile.coat)
    sphere(
      'head',
      [hx, hy, hz],
      [dims.headRadius * 0.8, dims.headRadius, dims.headRadius],
      profile.coat,
    )
    sphere(
      'head',
      [hx, hy - 0.055, hz + profile.snout * 0.62],
      [0.09, 0.08, profile.snout * 0.74],
      profile.face,
    )
    sphere(
      'head',
      [hx, hy - 0.04, hz + profile.snout * 1.26],
      [0.055, 0.043, 0.041],
      profile.legs,
    )
    sphere(
      'tail',
      [tx, ty - 0.09, tz - profile.tail * 0.65],
      [0.057, 0.072, profile.tail * 0.76],
      profile.coat,
    )
    for (const side of [-1, 1]) {
      sphere(
        'head',
        [hx + side * 0.104, hy + profile.ears, hz - 0.048],
        [0.052, profile.ears, 0.039],
        profile.face,
      )
      sphere(
        'head',
        [hx + side * 0.107, hy + 0.025, hz + 0.103],
        [0.025, 0.021, 0.024],
        profile.legs,
      )
    }
    for (const chain of QUADRUPED_LEGS) {
      const [a, b, c] = contract.chains[chain]?.bones ?? []
      if (a === undefined || b === undefined || c === undefined)
        throw new Error(`Missing kit leg ${chain}`)
      limb(a, b, wildlife === 'deer' ? 0.095 : 0.12, profile.coat)
      limb(b, c, wildlife === 'deer' ? 0.065 : 0.084, profile.legs)
      const [x, y, z] = point(c)
      box(c, [x, y - 0.03, z + 0.023], [0.1, 0.088, 0.145], profile.legs)
    }
  } else {
    sphere('body', point('body'), [0.32, 0.28, 0.62], COLOUR.body)
    limb('neck1', 'neck2', 0.19, COLOUR.body)
    limb('neck2', 'head', 0.2, COLOUR.body)
    sphere('head', point('head'), [0.18, 0.18, 0.27], COLOUR.head)
    box('tail', [0, 0.59, -0.86], [0.065, 0.065, 0.3], COLOUR.dark)
    for (const chain of QUADRUPED_LEGS) {
      const [a, b, c] = contract.chains[chain]?.bones ?? []
      if (a === undefined || b === undefined || c === undefined)
        throw new Error(`Missing kit leg ${chain}`)
      limb(a, b, 0.1, COLOUR.body)
      limb(b, c, 0.08, COLOUR.dark)
      box(c, point(c), [0.11, 0.1, 0.17], COLOUR.dark)
    }
  }
  for (const attachment of options.attachments ?? []) {
    const socket = contract.sockets[attachment.socket]
    if (socket === undefined)
      throw new Error(`Unknown ${skeleton} socket ${attachment.socket}`)
    const origin = point(socket.bone),
      offset = attachment.at ?? [0, 0, 0]
    const at: Point = [
      origin[0] + socket.at[0] + offset[0],
      origin[1] + socket.at[1] + offset[1],
      origin[2] + socket.at[2] + offset[2],
    ]
    add(
      attachment.geometry.clone(),
      socket.bone,
      at,
      [1, 1, 1],
      COLOUR.dark,
      new Quaternion(),
      true,
    )
  }
  const geometry = mergeGeometries(fragments, false)
  for (const fragment of fragments) fragment.dispose()
  if (geometry === null)
    throw new Error('Kit reference surfaces differ in channels')
  const dims =
    wildlife !== undefined
      ? {
          ...WILDLIFE[wildlife].dims,
          feet: WILDLIFE[wildlife].dims.feet.map(
            ([x = 0, z = 0]): [number, number] => [x, z],
          ),
        }
      : skeleton === 'biped'
        ? {
            bodyY: 0.84,
            bodyHalfLen: 0.12,
            bodyRadius: 0.25,
            headRadius: 0.16,
            legLen: 0.84,
            halfWidth: 0.25,
            feet: [
              [0.14, 0.1],
              [-0.14, 0.1],
            ] as [number, number][],
          }
        : {
            bodyY: 0.62,
            bodyHalfLen: 0.52,
            bodyRadius: 0.32,
            headRadius: 0.27,
            legLen: 0.55,
            halfWidth: 0.32,
            feet: [
              [0.23, 0.47],
              [-0.23, 0.47],
              [0.23, -0.43],
              [-0.23, -0.43],
            ] as [number, number][],
          }
  if (options.head !== undefined) {
    const headPositions = options.head.getAttribute('position')
    let radius = 0
    for (let i = 0; i < headPositions.count; i++)
      radius = Math.max(
        radius,
        Math.hypot(
          headPositions.getX(i),
          headPositions.getY(i),
          headPositions.getZ(i),
        ),
      )
    dims.headRadius = radius
  }
  return {
    name: `kit.${wildlife ?? skeleton}`,
    skeleton,
    bones,
    dims,
    parts: [
      {
        name: `kit.${wildlife ?? skeleton}.body`,
        geometry,
        material: new MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.85,
        }),
      },
    ],
  }
}
