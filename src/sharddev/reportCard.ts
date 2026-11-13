import { performanceReport as report, performanceReportLines as lines, performanceTargetIssues as targets, type PerformanceReport as GameReport, type PerformanceObservations as GameObservations } from '@wildshard/format/product';
import type { Shardfile } from '@wildshard/format/shardSchema';

/** Author-facing report: declared bounds, measured scripts and explicit cold-network assumptions. */
export type PerformanceReport = GameReport;
/** Trusted native tick observations used by the author CLI, separate from declared costs. */
export type PerformanceObservations = GameObservations;
/** Evaluate complete performance with refusal by default; author identity never selects legacy warnings. */
export function performanceReport(source: Shardfile, observed: PerformanceObservations, policy: 'refuse' | 'warn' = 'refuse'): PerformanceReport { return report(source, observed, policy); }
/** Format every measured or estimated report field without claiming it is a phone reading. */
export function performanceReportLines(card: PerformanceReport): string[] { return lines(card); }
/** Check wire and render targets before immutable asset reads or execution. */
export function performanceTargetIssues(source: Shardfile, policy: 'refuse' | 'warn' = 'refuse'): ReturnType<typeof targets> { return targets(source, policy); }
