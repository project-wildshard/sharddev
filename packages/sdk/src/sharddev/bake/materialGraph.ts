import { validateGraph, type GraphIr, type GraphNode, type GraphRef, type GraphParam, type GraphStages, type GraphArrayParam } from '@wildshard/format/materialGraph';
import type { ScaledPostRow } from '@wildshard/format/scaledPost';
import type { PostGraphLookRow } from '@wildshard/format/postGraphLook';
import { COLOUR_LUT_EDGE } from '@wildshard/format/colourLut';

/** Map clamped display-sRGB to cube texel centres, preserving native graph arithmetic order. */
export function colourLutSampleTransform(): { readonly scale: number; readonly offset: number } {
  return { scale: (COLOUR_LUT_EDGE - 1) / COLOUR_LUT_EDGE, offset: 0.5 / COLOUR_LUT_EDGE };
}

/** Portable authored graph grammar; no shader compiler, renderer or material is installed. */
export type AuthorGraph = GraphIr;
/** One ordered author node, retaining loops and exact numeric literals. */
export type AuthorGraphNode = GraphNode;
/** A declared node identity or native scalar/vector literal. */
export type AuthorGraphRef = GraphRef;
/** Typed authored parameter policy, including lent textures and bindings. */
export type AuthorGraphParam = GraphParam;
/** Original material, fog and post stage outputs. */
export type AuthorGraphStages = GraphStages;
/** Fixed-capacity authored array policy. */
export type AuthorGraphArrayParam = GraphArrayParam;
/** Data-only scaled post pass topology and resource wiring. */
export type AuthorScaledPost = ScaledPostRow;
/** Complete authored post look, including ordered pass topology and resource wiring. */
export type AuthorPostGraphLook = PostGraphLookRow;

/** Validate an offline author's complete graph under the existing trusted author budget.
 * Keep diagnostics and graph normalization identical; runtime admission still owns its own caps. */
export function checkAuthorGraph(input: unknown): ReturnType<typeof validateGraph> {
  return validateGraph(input, { trustedBudget: true });
}
