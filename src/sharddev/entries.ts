import { Matrix4, Object3D, Vector3 } from 'three';
import { updateAuthoringMatrix } from './sceneTransform';
import { parsePortalLink, type PortalLink as PortalLinkData } from '@wildshard/format/portalLink';
import { parseSocketLift, type SocketLift as SocketLiftData } from '@wildshard/format/socketLift';
import { CHUNK_HALF, ENTRY_WIDTH, ENTRY_ASPHALT } from '@wildshard/format/contentBounds';

/** Detached platform dimensions for authored midpoint sockets and their road reserve. */
export function roadSocketMetrics(): { half: number; width: 8; asphalt: 15 } {
    return { half: CHUNK_HALF, width: ENTRY_WIDTH, asphalt: ENTRY_ASPHALT };
}
/** A road socket's boundary edge, with +Z north. */
export type EntryEdge = 'north' | 'east' | 'south' | 'west';
/** Authored entry row for the four road-height midpoint openings. */
export interface EntryData {
    edge: EntryEdge;
    at: [
        number,
        number,
        number
    ];
    width: 8;
    kind?: 'ground' | 'socketOverWater' | 'portalLink' | 'socketLift';
    portal?: PortalLinkData;
    lift?: SocketLiftData;
}
const MIDPOINTS = { north: [0, 0, 250], east: [250, 0, 0], south: [0, 0, -250], west: [-250, 0, 0] } as const;
/** A fixed 8 x 15 metre socket declaration; it does not create a floor or flatten authored ground. */
export class Entry extends Object3D {
    /** The boundary edge this road socket occupies. */
    edge: EntryEdge;
    /** Optional floor admission kind; absent retains the host default. */
    kind: EntryData['kind'];
    private bindings: Pick<EntryData, 'portal' | 'lift'>;
    constructor(edge: EntryEdge = 'north', kind?: EntryData['kind'], bindings: Pick<EntryData, 'portal' | 'lift'> = {}) {
        super();
        this.edge = edge; this.kind = kind; this.bindings = structuredClone(bindings);
        this.name = `entry.${edge}`;
        const at = MIDPOINTS[edge];
        this.position.set(at[0], at[1], at[2]);
    }
    /** Clone the edge and kind with the normal scene transform and hierarchy. */
    override copy(source: this, recursive = true): this { super.copy(source, recursive); this.edge = source.edge; this.kind = source.kind; this.bindings = structuredClone(source.bindings); return this; }
    /** The four independent midpoint objects, in north/east/south/west order. */
    static midpoints(): Entry[] { return (['north', 'east', 'south', 'west'] as const).map(edge => new Entry(edge)); }
    /** Special entry subclasses supply their admitted link; a plain socket cannot guess one. */
    protected entryBindings(): Pick<EntryData, 'portal' | 'lift'> {
        if (this.kind === 'portalLink') { if (this.bindings.portal === undefined) throw new Error('Entry requires its matching portal link'); return { portal: parsePortalLink(this.bindings.portal) }; }
        if (this.kind === 'socketLift') { if (this.bindings.lift === undefined) throw new Error('Entry requires its matching lift link'); return { lift: parseSocketLift(this.bindings.lift) }; }
        return {};
    }
    /** Entries must retain their exact road-height world midpoint; geometry proof happens during validation. */
    toEntryData(): EntryData {
        updateAuthoringMatrix(this);
        const at = new Vector3().setFromMatrixPosition(this.matrixWorld);
        if (!at.equals(new Vector3(...MIDPOINTS[this.edge])))
            throw new Error('Entry must remain at its road-height midpoint');
        const expected = new Matrix4().makeTranslation(at.x, at.y, at.z);
        if (this.matrixWorld.elements.some((value, index) => !Number.isFinite(value) || Math.abs(value - (expected.elements[index] ?? Infinity)) > 1e-8))
            throw new Error('Entry socket frame cannot rotate, scale or shear');
        return { edge: this.edge, at: [at.x, at.y, at.z], width: 8, ...(this.kind === undefined ? {} : { kind: this.kind }), ...this.entryBindings() };
    }
}

/** A midpoint entry whose named mover/gate takes real feet from the road to its authored top stop. */
export class SocketLift extends Entry {
    /** The bounded cell-local lift, approach and onward route; native mover ownership stays with the host. */
    lift: SocketLiftData | undefined;
    constructor(edge: EntryEdge = 'north', lift?: SocketLiftData) { super(edge, 'socketLift'); this.lift = lift === undefined ? undefined : structuredClone(parseSocketLift(lift)); }
    /** Clone the lift declaration without sharing mutable author route rows. */
    override copy(source: this, recursive = true): this { super.copy(source, recursive); this.lift = source.lift === undefined ? undefined : structuredClone(source.lift); return this; }
    /** Emit exactly the existing entry wire shape, without guessing missing stops or floors. */
    protected override entryBindings(): Pick<EntryData, 'lift'> {
        if (this.lift === undefined || this.kind !== 'socketLift') throw new Error('SocketLift entry requires its lift link');
        return { lift: parseSocketLift(this.lift) };
    }
}
