/**
 * MEMORY-STRUCTURE STR13 (meta `docs/plans/MEMORY-STRUCTURE-PLAN.md`): the phone triangle budget on the report card.
 *
 * STR12's probe halved Nine's static triangles on the online boot and read locked pairs: 616 k resident triangles off
 * gave back 50 MB [K] settled (58 MB of GPU process), while the triangles drawn per frame fell only 78 k. The phone pays
 * for the triangles it holds, not the ones a view draws, so the budget counts the built shard's static triangles: every
 * GLB's, each geometry once (instances share it). 600 k is the line: about 50 MB [K] at today's vertex layouts (STR12's
 * 8.2 MB per 100 k), and at the census's worst view (43% of the resident triangles drawn, Nine) about 260 k on screen,
 * the first-principles study's phone-Low frame. Over it `wildshard check` warns and the upload still takes it (J424).
 */
import type { ShardGeometry } from './vertexLayout';

/** Static triangles a phone-Low zone holds (STR12). */
export const PHONE_TRIANGLE_BUDGET = 600_000;

/** A finding in check's shape: a stable code (refusals.ts names its rule) and the words. */
export interface BudgetFinding { readonly code: string; readonly message: string }

const thousands = (n: number): string => `${(n / 1000).toFixed(0)} k`;

/** The report card's line: the reading against the budget. */
export function triangleBudgetLine(geometry: ShardGeometry): string {
  return `${thousands(geometry.triangles)} static triangles of ${thousands(PHONE_TRIANGLE_BUDGET)} (phone Low), ${thousands(geometry.vertices)} vertices in ${String(geometry.glbs)} GLB${geometry.glbs === 1 ? '' : 's'}`;
}

/** Over the budget warns; it never refuses (J424: memory gates report). */
export function triangleBudgetWarnings(geometry: ShardGeometry): BudgetFinding[] {
  if (geometry.triangles <= PHONE_TRIANGLE_BUDGET) return [];
  return [{ code: 'triangle-budget', message: `the shard holds ${thousands(geometry.triangles)} static triangles, over the phone-Low budget of ${thousands(PHONE_TRIANGLE_BUDGET)} (a report-only line: upload still takes it)` }];
}
