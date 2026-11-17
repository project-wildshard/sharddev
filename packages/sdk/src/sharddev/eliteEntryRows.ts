import { parseEliteEntryRows as parseRows, parseEliteEntryPageRows as parsePage,
  ELITE_BODY_COLUMNS as bodyColumns, ELITE_CONDITION_COLUMNS as conditionColumns,
  type EliteEntryRows as Rows, type EliteEntryPageRows as Page } from '@wildshard/format/eliteEntryRows';
import { parseEliteOutputActions as parseActions, type EliteOutputAction as Action,
  ELITE_VIEW_FIELDS as viewFields, eliteViewSource as viewSource, eliteViewTell as viewTell } from '@wildshard/format/eliteFeature';

/** Defining ordered input columns lent by each elite's native presentation owner. */
export const ELITE_VIEW_FIELDS: typeof viewFields = viewFields;
/** Native named input source; constructing its label installs no view owner. */
export function eliteViewSource(elite: string): string { return viewSource(elite); }
/** Native named lane tell; its lifetime remains with the entered owner. */
export function eliteViewTell(elite: string): string { return viewTell(elite); }

/** Admitted native elite-construction rows. */
export type EliteEntryRows = Rows;
/** Admitted page-owned elite-construction rows. */
export type EliteEntryPageRows = Page;
/** An admitted bounded output action. */
export type EliteOutputAction = Action;
/** Stable observation columns used by the defining construction host. */
export const ELITE_BODY_COLUMNS: typeof bodyColumns = bodyColumns;
/** Stable condition columns used by the defining construction host. */
export const ELITE_CONDITION_COLUMNS: typeof conditionColumns = conditionColumns;
/** Admit native construction data with the unchanged runtime parser. */
export function parseEliteEntryRows(input: unknown): Rows { return parseRows(input); }
/** Admit page construction data with the unchanged runtime parser. */
export function parseEliteEntryPageRows(input: unknown): Page { return parsePage(input); }
/** Admit ordered output actions against the original controller bound. */
export function parseEliteOutputActions(input: unknown, controllers: number): readonly Action[] { return parseActions(input, controllers); }
