import { clipAnimate as platformClipAnimate, playClips as platformPlayClips, type ClipCase as PlatformClipCase, type ClipChannel as PlatformClipChannel, type ClipClock as PlatformClipClock, type ClipCtx as PlatformClipCtx, type ClipFactor as PlatformClipFactor, type ClipRow as PlatformClipRow, type ClipTerm as PlatformClipTerm, type ClipWhen as PlatformClipWhen, type SpeciesClips as PlatformSpeciesClips } from '@wildshard/engine/game/plugin/animation';

/** The clocks a clip factor reads: the animal's time or its gait phase. */
export type ClipClock = PlatformClipClock;
/** When a clip case or term applies. */
export type ClipWhen = PlatformClipWhen;
/** One factor of a clip term (a bare number is a constant). */
export type ClipFactor = PlatformClipFactor;
/** One term of a clip sum: a constant or a product of factors. */
export type ClipTerm = PlatformClipTerm;
/** One case of a clip row. */
export type ClipCase = PlatformClipCase;
/** The bone channels a clip row drives. */
export type ClipChannel = PlatformClipChannel;
/** One clip row: a bone's channel and its cases. */
export type ClipRow = PlatformClipRow;
/** A species' declarative clips (SHARD-PLATFORM M3). */
export type SpeciesClips = PlatformSpeciesClips;
/** What a clip reads from the frame. */
export type ClipCtx = PlatformClipCtx;
/** Plays one frame of a species' clips on its bones. */
export const playClips: typeof platformPlayClips = platformPlayClips;
/** A species' `animate` from its clip rows. */
export const clipAnimate: typeof platformClipAnimate = platformClipAnimate;
