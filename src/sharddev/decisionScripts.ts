import { parseReturnProjectionV2 as parseProjection, type ReturnProjectionV2Rows as Projection } from '@wildshard/format/returnProjectionV2';
import { parseDecisionScripts as parse, SCRIPT_V1_REFERENCE_KINDS, type DecisionScriptRow as Row } from '@wildshard/format/decisionScripts';
import { SCRIPT_V2_REVISIONS } from '@wildshard/format/scriptAdmissionV2';
import { parseActorProjectionV2 as nativeActorProjection } from '@wildshard/format/actorProjectionV2';
import type { GroupStepProfileV2 } from '@wildshard/format/scriptGroupStepV2';

/** Complete group author profile, including bank, columns, signals and native actions. */
export type AuthorGroupStepProfile = GroupStepProfileV2;

/** Version stamps for source-owned projection metadata; no compiler is loaded. */
export function scriptV2Revisions(): typeof SCRIPT_V2_REVISIONS { return SCRIPT_V2_REVISIONS; }

/** Defining v1 reference maps whose empty defaults may be omitted from author wires. */
export function scriptV1ReferenceKinds(): typeof SCRIPT_V1_REFERENCE_KINDS { return SCRIPT_V1_REFERENCE_KINDS; }

/** Admitted decision-script metadata, independent of source readers and compilation services. */
export type DecisionScriptRow = Row;
/** Admit bounded script metadata with the unchanged runtime contract; no source file is read or compiled. */
export function parseDecisionScripts(input: unknown): readonly Row[] { return parse(input); }

/** Strict numeric projection metadata, with no compiler or filesystem dependency. */
export type ReturnProjectionV2Rows = Projection;
/** Admit cached or authored projection metadata through the runtime's complete contract. */
export function parseReturnProjectionV2(input: unknown): ReturnProjectionV2Rows { return parseProjection(input); }

/** Admit JSON actor columns and operations with the defining ABI2, declared
 * signal/field/channel checks. No compiler, runtime or continuation is created. */
export function actorProjectionRows(input: unknown): ReturnType<typeof nativeActorProjection> { return nativeActorProjection(input); }
