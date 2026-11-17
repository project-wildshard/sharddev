import { Object3D, Vector3 } from 'three';
import { ZiplineModeSchema, UpdraftModeSchema, type ZiplineMode, type UpdraftMode, RideModeSchema, type RideMode, GrappleModeSchema, type GrappleMode, LadderModeSchema, type LadderMode } from '@wildshard/format/modes';
import * as v from 'valibot';
import { updateAuthoringMatrix } from './sceneTransform';

/** A complete set of admitted platform traversal declarations. */
export interface ModeRows { grapple?: GrappleMode[]; ride?: RideMode[]; traverse: (ZiplineMode | UpdraftMode | LadderMode)[] }

/** Data-only cable parameters; its endpoints come from ordinary authoring vectors. */
export type ZiplineOptions = Partial<Pick<ZiplineMode, 'sag' | 'hang' | 'gravity' | 'drag' | 'maxSpeed'>>;
/** An authored cable traversal in a normal three.js hierarchy; nothing installs a runtime service. */
export class Zipline extends Object3D {
  /** Floor positions in this object's local frame. */
  readonly top: Vector3 = new Vector3();
  /** The floor at the landing, in this object's local frame. */
  readonly bottom: Vector3 = new Vector3();
  /** Bounded physical parameters emitted at synth time. */
  options: ZiplineOptions;
  constructor(top: Vector3 = new Vector3(), bottom: Vector3 = new Vector3(), options: ZiplineOptions = {}) {
    super(); this.name = 'zipline'; this.top.copy(top); this.bottom.copy(bottom); this.options = { ...options };
  }
  /** Clone independent endpoint vectors and parameter data together with the normal graph state. */
  override copy(source: this, recursive = true): this { super.copy(source, recursive); this.top.copy(source.top); this.bottom.copy(source.bottom); this.options = { ...source.options }; return this; }
  /** Emit validated world-space floors; the platform derives cable height and sag using one law. */
  toModeData(): ZiplineMode {
    updateAuthoringMatrix(this);
    const top = this.top.clone().applyMatrix4(this.matrixWorld), bottom = this.bottom.clone().applyMatrix4(this.matrixWorld);
    return v.parse(ZiplineModeSchema, { ...this.options, kind: 'zipline', id: this.name,
      top: { x: top.x, y: top.y, z: top.z }, bottom: { x: bottom.x, y: bottom.y, z: bottom.z } });
  }
}

/** The width and force of a directional board wind column. */
export interface UpdraftOptions { width: number; lift: number; margin?: number }
const DEFAULT_UPDRAFT = { width: 1, lift: 0 };
/** An authored directional wind column; from/to are local points and the ceiling is to.y + margin. */
export class Updraft extends Object3D {
  /** Beginning of the column's horizontal run. */
  readonly from: Vector3 = new Vector3();
  /** End of the run, including its upper ceiling. */
  readonly to: Vector3 = new Vector3();
  /** Data-only world-metre width and force. */
  options: UpdraftOptions;
  constructor(from: Vector3 = new Vector3(), to: Vector3 = new Vector3(), options: UpdraftOptions = DEFAULT_UPDRAFT) {
    super(); this.name = 'updraft'; this.from.copy(from); this.to.copy(to); this.options = { ...options };
  }
  /** Clone independent endpoints and bounded tuning with the normal transform. */
  override copy(source: this, recursive = true): this { super.copy(source, recursive); this.from.copy(source.from); this.to.copy(source.to); this.options = { ...source.options }; return this; }
  /** Emit the admitted world-space column; width and margin remain explicit world metres. */
  toModeData(): UpdraftMode {
    updateAuthoringMatrix(this);
    const from = this.from.clone().applyMatrix4(this.matrixWorld), to = this.to.clone().applyMatrix4(this.matrixWorld);
    return v.parse(UpdraftModeSchema, { ...this.options, kind: 'updraft', id: this.name,
      from: { x: from.x, y: from.y, z: from.z }, to: { x: to.x, y: to.y, z: to.z } });
  }
}

/** A mounted control profile with normal three.js graph semantics; it neither spawns nor grants a mount. */
export class Mount extends Object3D {
  /** Explicit bounded gait speeds in metres per second. */
  gaits: RideMode['gaits'];
  constructor(gaits: RideMode['gaits']) { super(); this.name = 'ride'; this.gaits = { ...gaits }; }
  /** Copy independent control parameters with the ordinary graph state. */
  override copy(source: this, recursive = true): this { super.copy(source, recursive); this.gaits = { ...source.gaits }; return this; }
  /** Emit validated control data; native mount/taming ownership stays with the host. */
  toModeData(): RideMode { return v.parse(RideModeSchema, { id: this.name, gaits: this.gaits }); }
}

/** A native grapple control profile; the real world and its owner still provide anchors, floors and guards. */
export class Grapple extends Object3D {
  /** Bounded selection and timing parameters; omitted fields retain native defaults. */
  options: Partial<Omit<GrappleMode, 'id'>>;
  constructor(options: Partial<Omit<GrappleMode, 'id'>> = {}) { super(); this.name = 'grapple'; this.options = { ...options }; }
  /** Copy independent parameters together with normal three.js graph semantics. */
  override copy(source: this, recursive = true): this { super.copy(source, recursive); this.options = { ...source.options }; return this; }
  /** Emit data only; no synthetic anchors, targets, floors or gameplay grants. */
  toModeData(): GrappleMode { return v.parse(GrappleModeSchema, { id: this.name, ...this.options }); }
}

/** Explicit world-metre climb controls; the outward normal is a local horizontal direction. */
export interface LadderOptions { reach?: number; speed?: number }
/** Vertical climbing declaration with ordinary scene transforms; its visible rungs, rails and colliders remain authored. */
export class Ladder extends Object3D {
  /** Local lower floor; the capsule starts climbing here without teleporting. */
  readonly bottom: Vector3 = new Vector3();
  /** Local top of the vertical route. */
  readonly top: Vector3 = new Vector3(0, 3, 0);
  /** Local upper landing floor beyond the top; the motor sweeps the exit. */
  readonly exit: Vector3 = new Vector3(0, 3, -1);
  /** Local outward horizontal direction; its opposite climbs and its direction descends. */
  readonly normal: Vector3 = new Vector3(0, 0, 1);
  /** Bounded speed/reach, explicitly in world metres. */
  options: LadderOptions;
  constructor(bottom: Vector3 = new Vector3(), top: Vector3 = new Vector3(0, 3, 0), exit: Vector3 = new Vector3(0, 3, -1), options: LadderOptions = {}) {
    super(); this.name = 'ladder'; this.bottom.copy(bottom); this.top.copy(top); this.exit.copy(exit); this.options = { ...options };
  }
  /** Copy independent route vectors and parameters with the normal scene graph. */
  override copy(source: this, recursive = true): this {
    super.copy(source, recursive); this.bottom.copy(source.bottom); this.top.copy(source.top); this.exit.copy(source.exit);
    this.normal.copy(source.normal); this.options = { ...source.options }; return this;
  }
  /** Emit a validated world route; tilted/nonvertical routes refuse rather than silently changing their law. */
  toModeData(): LadderMode {
    updateAuthoringMatrix(this);
    const bottom = this.bottom.clone().applyMatrix4(this.matrixWorld), top = this.top.clone().applyMatrix4(this.matrixWorld);
    const exit = this.exit.clone().applyMatrix4(this.matrixWorld), normal = this.normal.clone().transformDirection(this.matrixWorld);
    if (Math.abs(normal.y) > 1e-10) throw new Error('Ladder normal must remain horizontal');
    // Y-only rotation can leave identical endpoints a few ulps apart; no authored tilt is accepted.
    if (Math.hypot(top.x - bottom.x, top.z - bottom.z) > 1e-10) throw new Error('Ladder route must remain vertical');
    top.x = bottom.x; top.z = bottom.z;
    return v.parse(LadderModeSchema, { ...this.options, kind: 'ladder', id: this.name,
      bottom: { x: bottom.x, y: bottom.y, z: bottom.z }, top: { x: top.x, y: top.y, z: top.z },
      exit: { x: exit.x, y: exit.y, z: exit.z }, normal: { x: normal.x, z: normal.z } });
  }
}
